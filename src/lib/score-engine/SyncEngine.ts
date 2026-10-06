/**
 * SyncEngine — fila offline para ações de placar.
 *
 * Toda ação (ponto, encerramento, W.O., fim do cronômetro) é gravada primeiro
 * no aparelho (IndexedDB, chave `queue:<matchId>`) e enviada depois.
 *
 * Garantias:
 *   • gravações na fila são atômicas (`update` do idb-keyval = ler+gravar numa
 *     só transação): um toque feito durante o envio nunca é apagado;
 *   • um envio por partida por vez — no app inteiro (Web Locks entre abas) e
 *     dentro da aba (pedidos durante um envio entram numa nova passada);
 *   • a fila é compactada: só o último placar de cada game é enviado, e games
 *     seguidos sobem num único upsert;
 *   • conflito é detectado comparando games (servidor × última versão que este
 *     aparelho viu do servidor), nunca relógios;
 *   • o que o servidor recusa não some: vai para a lista de falhas
 *     (`sync-failures`), visível em /sincronizacao;
 *   • com a RPC `apply_match_ops` no banco (Fase 2), a fila inteira sobe numa
 *     única chamada e numa transação; sem ela, cai no envio ação por ação.
 */

import { get, set, del, keys, update } from 'idb-keyval'
import { createClient } from '@/utils/supabase/client'
import { getDeviceId } from './deviceId'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ActionType =
  | 'upsert_game'
  | 'delete_game'
  | 'finalize_match'
  | 'finish_timer'
  | 'reopen_match'
  | 'clear_match'
  | 'set_schedule'

export type QueueAction = {
  id: string
  matchId: string
  type: ActionType
  payload: Record<string, unknown>
  timestamp: number
  deviceId: string
}

export type FlushResult = {
  conflict: boolean
  synced: number
  /** Ação recusada pelo servidor (permissão, regra de negócio…) — movida p/ falhas. */
  error?: string
  /** Parou por falta de rede: o resto continua na fila. */
  stalled?: boolean
}

export type GameRow = { game_number: number; score_a: number; score_b: number }

/** Mudanças na fila/falhas — telas de status escutam este evento. */
export const SYNC_EVENT = 'sb-sync-changed'

function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_EVENT))
}

// ─── Finalização (encerrar / desclassificar / W.O. / W.O. duplo) ──────────────

export type FinalizeKind = 'result' | 'dq' | 'wo' | 'double_wo'

export type FinalizeInput = {
  kind: FinalizeKind
  /** lado_a | lado_b | empate (kind=result); lado_a | lado_b (dq/wo); ignorado em double_wo */
  result?: string | null
  isOrganizer: boolean
}

/** Formato persistido na fila (mantém compatibilidade com itens antigos: isDq/isWo). */
type FinalizePayload = {
  result: string | null
  isOrganizer: boolean
  isDq?: boolean
  isWo?: boolean
  isDoubleWo?: boolean
}

/** Fim do cronômetro (contagem por tempo): grava a duração e o placar final. */
type FinishTimerPayload = {
  seconds: number
  score_a: number
  score_b: number
  /** a fase permite empate? (só p/ mostrar o resultado offline) */
  drawAllowed: boolean
}

function toPayload(input: FinalizeInput): FinalizePayload {
  return {
    result: input.kind === 'double_wo' ? null : (input.result ?? null),
    isOrganizer: input.isOrganizer,
    isDq: input.kind === 'dq' || undefined,
    isWo: input.kind === 'wo' || input.kind === 'double_wo' || undefined,
    isDoubleWo: input.kind === 'double_wo' || undefined,
  }
}

function kindOf(p: FinalizePayload): FinalizeKind {
  if (p.isDoubleWo) return 'double_wo'
  if (p.isWo) return 'wo'
  if (p.isDq) return 'dq'
  return 'result'
}

function finalizeRpc(matchId: string, p: FinalizePayload): { name: string; params: Record<string, unknown> } {
  const suffix = p.isOrganizer ? '' : '_by_participant'
  switch (kindOf(p)) {
    case 'double_wo':
      return { name: `finalize_match_double_wo${suffix}`, params: { _match_id: matchId } }
    case 'wo':
      return { name: `finalize_match_wo${suffix}`, params: { _match_id: matchId, _winner: p.result } }
    case 'dq':
      return { name: `finalize_match_dq${suffix}`, params: { _match_id: matchId, _winner: p.result } }
    default:
      return {
        name: p.isOrganizer ? 'finalize_match_manual' : 'finalize_match_by_participant',
        params: { _match_id: matchId, _result: p.result },
      }
  }
}

/** Resultado de um placar por tempo (null = empate não permitido). */
function timerResult(p: FinishTimerPayload): string | null {
  if (p.score_a > p.score_b) return 'lado_a'
  if (p.score_b > p.score_a) return 'lado_b'
  return p.drawAllowed ? 'empate' : null
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/**
 * Falha de rede? O supabase-js NÃO lança em fetch falho — devolve `{ error }` com
 * a mensagem do TypeError ("Failed to fetch", "Load failed"…). Com sinal fraco o
 * `navigator.onLine` segue true, então checar só ele deixa a ação se perder.
 * "unexpected response" = resposta que não veio do app (portal cativo, proxy).
 */
export function isNetworkError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err ?? '')
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|internet connection|unexpected response|network connection was lost/i.test(
    msg,
  )
}

// ─── Chaves no IndexedDB ──────────────────────────────────────────────────────

const queueKey = (matchId: string) => `queue:${matchId}`
/** Games do servidor que este aparelho viu por último (base p/ detectar conflito). */
const baseKey = (matchId: string) => `base:${matchId}`
/** Rótulo e link da partida (p/ a tela de sincronização). */
const metaKey = (matchId: string) => `sync-meta:${matchId}`
const FAILURES_KEY = 'sync-failures'

async function getQueue(matchId: string): Promise<QueueAction[]> {
  await recoverJournal()
  return ((await get(queueKey(matchId))) as QueueAction[] | undefined) ?? []
}

// ─── Diário síncrono (nenhum toque se perde) ─────────────────────────────────
// A fila mora no IndexedDB, cuja gravação é assíncrona: fechar o app (ou a aba)
// logo depois de uma sequência de toques podia descartar os últimos pontos.
// Cada ação entra ANTES num diário no localStorage — gravação síncrona, que
// sobrevive a fechar o app no mesmo instante — e sai dele assim que o
// IndexedDB confirma. Ao abrir, o que ficou no diário volta para a fila.

const JOURNAL_KEY = 'sb-queue-journal'

function readJournal(): QueueAction[] {
  try {
    const raw = globalThis.localStorage?.getItem(JOURNAL_KEY)
    return raw ? (JSON.parse(raw) as QueueAction[]) : []
  } catch {
    return []
  }
}

function writeJournal(items: QueueAction[]): void {
  try {
    if (items.length) globalThis.localStorage?.setItem(JOURNAL_KEY, JSON.stringify(items))
    else globalThis.localStorage?.removeItem(JOURNAL_KEY)
  } catch {
    /* sem localStorage (modo privado cheio): fica só o IndexedDB, como antes */
  }
}

function journalAdd(item: QueueAction): void {
  writeJournal([...readJournal(), item])
}

function journalRemove(ids: Set<string>): void {
  const j = readJournal()
  const rest = j.filter((a) => !ids.has(a.id))
  if (rest.length !== j.length) writeJournal(rest)
}

/**
 * Junta à fila as ações do diário que não chegaram ao IndexedDB. Uma ação do
 * diário só é nova se for mais recente que tudo que a fila já tem (a gravação
 * é em ordem); o que é mais antigo já foi gravado (ou compactado).
 */
async function applyJournal(items: QueueAction[]): Promise<void> {
  const byMatch = new Map<string, QueueAction[]>()
  for (const a of items) byMatch.set(a.matchId, [...(byMatch.get(a.matchId) ?? []), a])
  for (const [matchId, list] of byMatch) {
    await update<QueueAction[]>(queueKey(matchId), (old) => {
      const q = old ?? []
      const have = new Set(q.map((a) => a.id))
      const newest = q.reduce((m, a) => Math.max(m, a.timestamp), -Infinity)
      return list
        .filter((a) => !have.has(a.id) && a.timestamp >= newest)
        .sort((x, y) => x.timestamp - y.timestamp)
        .reduce((acc, a) => compactQueue(acc, a), q)
    })
  }
  journalRemove(new Set(items.map((a) => a.id)))
}

let journalRecovery: Promise<void> | null = null

/** Uma vez por carga do app: recupera o diário antes de qualquer leitura da fila. */
function recoverJournal(): Promise<void> {
  if (!journalRecovery) {
    // Itens deste carregamento (ainda gravando) não são "sobras".
    const leftovers = readJournal().filter((a) => !buffered.has(a.id))
    journalRecovery = leftovers.length
      ? applyJournal(leftovers).then(notify, () => {})
      : Promise.resolve()
  }
  return journalRecovery
}

/** Testes: simula uma nova carga do app. */
export function __resetJournalRecovery(): void {
  journalRecovery = null
}

// Gravação em lote por partida: toques que chegam enquanto o IndexedDB grava
// entram juntos na próxima transação (em vez de uma por toque).
const pendingWrites = new Map<string, QueueAction[]>()
const writers = new Map<string, Promise<void>>()
const buffered = new Set<string>()

function writeBuffered(matchId: string): Promise<void> {
  const running = writers.get(matchId)
  if (running) return running
  const w = (async () => {
    try {
      await recoverJournal()
      for (;;) {
        const batch = pendingWrites.get(matchId) ?? []
        if (batch.length === 0) break
        pendingWrites.set(matchId, [])
        await update<QueueAction[]>(queueKey(matchId), (old) => {
          const have = new Set((old ?? []).map((a) => a.id))
          return batch.filter((a) => !have.has(a.id)).reduce((acc, a) => compactQueue(acc, a), old ?? [])
        })
        const ids = new Set(batch.map((a) => a.id))
        ids.forEach((id) => buffered.delete(id))
        journalRemove(ids)
        notify()
      }
    } finally {
      // Sem await entre o fim do laço e aqui: um toque novo abre outro lote.
      writers.delete(matchId)
    }
  })()
  writers.set(matchId, w)
  return w
}

// ─── Compactação ─────────────────────────────────────────────────────────────
// Placar é absoluto (score_a/score_b do game), então só o último upsert de cada
// game importa. Nunca compacta por cima de um encerramento: o que veio antes de
// "encerrar" precisa chegar antes dele.

/** Ações que mudam o estado da partida: placar anterior a elas não se mistura com o posterior. */
const BARRIERS: ActionType[] = ['finalize_match', 'finish_timer', 'reopen_match', 'clear_match']

export function compactQueue(queue: QueueAction[], item: QueueAction): QueueAction[] {
  // Data: só a última vale.
  if (item.type === 'set_schedule') return [...queue.filter((a) => a.type !== 'set_schedule'), item]
  // Limpar a partida apaga placar e encerramento: o que veio antes não precisa subir.
  if (item.type === 'clear_match') return [...queue.filter((a) => a.type === 'set_schedule'), item]
  if (item.type !== 'upsert_game') return [...queue, item]
  const game = (item.payload as GameRow).game_number
  let barrier = -1
  queue.forEach((a, i) => {
    if (BARRIERS.includes(a.type)) barrier = i
  })
  const kept = queue.filter(
    (a, i) =>
      i <= barrier ||
      !(
        (a.type === 'upsert_game' || a.type === 'delete_game') &&
        (a.payload as { game_number: number }).game_number === game
      ),
  )
  return [...kept, item]
}

// ─── enqueue ─────────────────────────────────────────────────────────────────

export async function enqueue(
  action: Pick<QueueAction, 'matchId' | 'type' | 'payload'>,
): Promise<void> {
  const item: QueueAction = {
    id: crypto.randomUUID(),
    matchId: action.matchId,
    type: action.type,
    payload: action.payload,
    timestamp: Date.now(),
    deviceId: getDeviceId(),
  }
  // 1º o diário (síncrono): a partir daqui o toque não se perde mais.
  journalAdd(item)
  buffered.add(item.id)
  pendingWrites.set(item.matchId, [...(pendingWrites.get(item.matchId) ?? []), item])
  // Resolve quando a gravação que inclui este item terminar.
  for (;;) {
    await writeBuffered(item.matchId)
    if (!buffered.has(item.id)) return
    // O lote em andamento começou antes deste item: espera o próximo.
  }
}

// ─── Base do servidor (detecção de conflito) ─────────────────────────────────

/**
 * Registra os games que o servidor tem agora. Só vale com a fila vazia: com
 * pendências, a base continua sendo o estado sobre o qual elas foram feitas.
 */
export async function rememberServerGames(matchId: string, games: GameRow[]): Promise<void> {
  const q = await getQueue(matchId)
  if (q.length > 0) return
  await set(baseKey(matchId), games.map(({ game_number, score_a, score_b }) => ({ game_number, score_a, score_b })))
}

/** Esquece a base: o próximo envio aplica o placar local sem checar conflito. */
export async function dropBase(matchId: string): Promise<void> {
  await del(baseKey(matchId))
}

const sameGame = (x?: GameRow, y?: GameRow) =>
  (x?.score_a ?? 0) === (y?.score_a ?? 0) && (x?.score_b ?? 0) === (y?.score_b ?? 0)

/**
 * Conflito = outro aparelho mudou, no servidor, um game que esta fila também
 * muda, para um valor diferente do nosso. Games que só um lado tocou se juntam.
 */
export function detectConflict(base: GameRow[], server: GameRow[], local: GameRow[]): boolean {
  const b = new Map(base.map((g) => [g.game_number, g]))
  const s = new Map(server.map((g) => [g.game_number, g]))
  for (const l of local) {
    const sv = s.get(l.game_number)
    const bv = b.get(l.game_number)
    if (!sameGame(sv, bv) && !sameGame(sv, l)) return true
  }
  return false
}

// ─── Falhas (ações recusadas pelo servidor) ──────────────────────────────────

export type SyncFailure = {
  id: string
  matchId: string
  action: QueueAction | null
  error: string
  at: number
}

export async function getFailures(): Promise<SyncFailure[]> {
  return ((await get(FAILURES_KEY)) as SyncFailure[] | undefined) ?? []
}

async function recordFailures(matchId: string, actions: (QueueAction | null)[], error: string) {
  const items: SyncFailure[] = actions.map((action) => ({
    id: crypto.randomUUID(),
    matchId,
    action,
    error,
    at: Date.now(),
  }))
  await update<SyncFailure[]>(FAILURES_KEY, (old) => [...(old ?? []), ...items])
}

export async function dismissFailure(id: string): Promise<void> {
  await update<SyncFailure[]>(FAILURES_KEY, (old) => (old ?? []).filter((f) => f.id !== id))
  notify()
}

/** Devolve a ação recusada para o fim da fila e tenta enviar de novo. */
export async function retryFailure(id: string): Promise<void> {
  const f = (await getFailures()).find((x) => x.id === id)
  await dismissFailure(id)
  if (!f?.action) return
  await enqueue({ matchId: f.matchId, type: f.action.type, payload: f.action.payload })
  void flush(f.matchId)
}

// ─── Rótulos (tela de sincronização) ─────────────────────────────────────────

export type SyncMeta = { label: string; href: string }

export async function setSyncMeta(matchId: string, meta: SyncMeta): Promise<void> {
  try {
    await set(metaKey(matchId), meta)
  } catch {
    /* informativo */
  }
}

export async function getSyncMeta(matchId: string): Promise<SyncMeta | null> {
  return ((await get(metaKey(matchId))) as SyncMeta | undefined) ?? null
}

// ─── Envio ────────────────────────────────────────────────────────────────────

// ok       → aplicada
// retry    → falha de rede: mantém na fila e tenta de novo depois
// rejected → o servidor recusou (permissão/regra): sai da fila e vai p/ falhas
type Outcome = { kind: 'ok' } | { kind: 'retry' } | { kind: 'rejected'; error: string }

type Client = ReturnType<typeof createClient>

/**
 * Sessão vencida (comum ao voltar depois de horas offline, antes do refresh do
 * token): não é recusa do servidor — tenta de novo depois.
 */
function isAuthError(error: { message: string; code?: string }): boolean {
  return (
    error.code === 'PGRST301' ||
    error.code === 'PGRST302' ||
    /jwt|not authenticated|refresh token/i.test(error.message)
  )
}

function outcomeOf(error: { message: string; code?: string } | null): Outcome {
  if (!error) return { kind: 'ok' }
  return isNetworkError(error) || isAuthError(error)
    ? { kind: 'retry' }
    : { kind: 'rejected', error: error.message }
}

async function guarded(fn: () => Promise<Outcome>): Promise<Outcome> {
  try {
    return await fn()
  } catch (err) {
    if (isNetworkError(err)) return { kind: 'retry' }
    return { kind: 'rejected', error: err instanceof Error ? err.message : 'erro desconhecido' }
  }
}

function upsertGames(supabase: Client, matchId: string, deviceId: string, rows: GameRow[]) {
  return guarded(async () => {
    const { error } = await supabase.from('match_games').upsert(
      rows.map((g) => ({
        match_id: matchId,
        game_number: g.game_number,
        score_a: g.score_a,
        score_b: g.score_b,
        last_device_id: deviceId,
      })),
      { onConflict: 'match_id,game_number' },
    )
    return outcomeOf(error)
  })
}

function applyAction(supabase: Client, matchId: string, deviceId: string, action: QueueAction) {
  return guarded(async () => {
    if (action.type === 'delete_game') {
      const { game_number } = action.payload as { game_number: number }
      const { error } = await supabase
        .from('match_games')
        .delete()
        .eq('match_id', matchId)
        .eq('game_number', game_number)
      return outcomeOf(error)
    }

    if (action.type === 'finalize_match') {
      const { name, params } = finalizeRpc(matchId, action.payload as FinalizePayload)
      const { error } = await supabase.rpc(name, params)
      return outcomeOf(error)
    }

    if (action.type === 'finish_timer') {
      // Ordem exigida por resolve_match no modo tempo: primeiro a duração (só
      // finaliza com duration_seconds preenchido), depois o placar, que dispara
      // o trigger e finaliza a partida.
      const p = action.payload as FinishTimerPayload
      const { error: dErr } = await supabase
        .from('matches')
        .update({ duration_seconds: p.seconds })
        .eq('id', matchId)
      if (dErr) return outcomeOf(dErr)
      const { error } = await supabase.from('match_games').upsert(
        { match_id: matchId, game_number: 1, score_a: p.score_a, score_b: p.score_b, last_device_id: deviceId },
        { onConflict: 'match_id,game_number' },
      )
      return outcomeOf(error)
    }

    if (action.type === 'reopen_match') {
      const { isOrganizer } = action.payload as { isOrganizer: boolean }
      if (isOrganizer) {
        // is_wo=false também zera is_double_wo (trigger)
        const { error } = await supabase
          .from('matches')
          .update({ status: 'em_andamento', result: null, is_wo: false })
          .eq('id', matchId)
          .eq('status', 'finalizado')
        return outcomeOf(error)
      }
      const { error } = await supabase.rpc('reopen_match_by_participant', { _match_id: matchId })
      return outcomeOf(error)
    }

    if (action.type === 'clear_match') {
      const { error } = await supabase.rpc('reset_match_data', { _match_id: matchId })
      return outcomeOf(error)
    }

    if (action.type === 'set_schedule') {
      const { at } = action.payload as { at: string | null }
      const { error } = await supabase.from('matches').update({ scheduled_at: at }).eq('id', matchId)
      return outcomeOf(error)
    }

    return { kind: 'ok' }
  })
}

// ─── Envio em lote (RPC apply_match_ops) ──────────────────────────────────────

type BatchOp = { type: string; ids: string[] } & Record<string, unknown>

/** Converte a fila em operações do lote. Upserts seguidos viram um só. */
export function buildBatchOps(queue: QueueAction[]): BatchOp[] {
  const ops: BatchOp[] = []
  for (const a of queue) {
    const last = ops[ops.length - 1]
    if (a.type === 'upsert_game') {
      const g = a.payload as GameRow
      const row = { game_number: g.game_number, score_a: g.score_a, score_b: g.score_b }
      if (last?.type === 'upsert_games') {
        const games = (last.games as GameRow[]).filter((x) => x.game_number !== g.game_number)
        last.games = [...games, row]
        last.ids.push(a.id)
      } else {
        ops.push({ type: 'upsert_games', ids: [a.id], games: [row] })
      }
    } else if (a.type === 'delete_game') {
      ops.push({ type: 'delete_game', ids: [a.id], game_number: (a.payload as { game_number: number }).game_number })
    } else if (a.type === 'finalize_match') {
      const p = a.payload as FinalizePayload
      ops.push({ type: 'finalize', ids: [a.id], kind: kindOf(p), result: p.result })
    } else if (a.type === 'finish_timer') {
      const p = a.payload as FinishTimerPayload
      ops.push({ type: 'finish_timer', ids: [a.id], seconds: p.seconds, score_a: p.score_a, score_b: p.score_b })
    } else if (a.type === 'reopen_match') {
      ops.push({ type: 'reopen', ids: [a.id] })
    } else if (a.type === 'clear_match') {
      ops.push({ type: 'clear', ids: [a.id] })
    } else if (a.type === 'set_schedule') {
      ops.push({ type: 'schedule', ids: [a.id], at: (a.payload as { at: string | null }).at })
    }
  }
  return ops
}

/** A RPC ainda não existe no banco (migração da Fase 2 não aplicada)? */
function isMissingRpc(error: { message: string; code?: string }): boolean {
  return error.code === 'PGRST202' || /could not find the function/i.test(error.message)
}

/**
 * Quando o banco ainda não tem a RPC (migração não aplicada), usa o envio ação
 * a ação e volta a testar a RPC a cada 10 min — passa a usá-la sozinho assim
 * que a migração for aplicada.
 */
let batchRpcMissingAt: number | null = null
const BATCH_REPROBE_MS = 10 * 60 * 1000

function batchRpcUsable(): boolean {
  return batchRpcMissingAt === null || Date.now() - batchRpcMissingAt > BATCH_REPROBE_MS
}

/** Só para testes: esquece o resultado da sondagem da RPC. */
export function __resetBatchProbe(): void {
  batchRpcMissingAt = null
}

type BatchResponse = {
  status: 'ok' | 'conflict' | 'missing'
  rejected?: { ids: string[] | null; error: string }[]
  games?: GameRow[]
}

/**
 * Envia a fila inteira numa chamada. Retorna null quando a RPC não existe
 * (o chamador cai no envio antigo).
 */
async function flushBatch(
  supabase: Client,
  matchId: string,
  deviceId: string,
  queue: QueueAction[],
): Promise<FlushResult | null> {
  const base = (await get(baseKey(matchId))) as GameRow[] | undefined
  const local = queuedGames(queue)
  let res: { data: unknown; error: { message: string; code?: string } | null }
  try {
    res = await supabase.rpc('apply_match_ops', {
      _match_id: matchId,
      _ops: buildBatchOps(queue),
      _base: base ?? null,
      _local: local.length > 0 ? local : null,
      _device_id: deviceId,
    })
  } catch (err) {
    if (isNetworkError(err)) return { conflict: false, synced: 0, stalled: true }
    throw err
  }

  if (res.error) {
    if (isMissingRpc(res.error)) {
      batchRpcMissingAt = Date.now()
      return null
    }
    if (isNetworkError(res.error) || isAuthError(res.error)) return { conflict: false, synced: 0, stalled: true }
    // Recusa da chamada inteira (ex.: sem permissão nesta partida).
    await dropFromQueue(matchId, queue, res.error.message)
    return { conflict: false, synced: queue.length, error: res.error.message }
  }
  batchRpcMissingAt = null

  const data = res.data as BatchResponse
  if (data.status === 'missing') {
    const reason = 'A partida não existe mais no servidor.'
    await dropFromQueue(matchId, queue, reason)
    return { conflict: false, synced: 0, error: reason }
  }
  if (data.status === 'conflict') {
    conflicted.add(matchId)
    return { conflict: true, synced: 0 }
  }

  // Tudo do lote foi processado (aplicado ou recusado): sai da fila.
  const sent = new Set(queue.map((a) => a.id))
  await update<QueueAction[]>(queueKey(matchId), (old) => (old ?? []).filter((a) => !sent.has(a.id)))
  const rejected = data.rejected ?? []
  for (const r of rejected) {
    const ids = new Set(r.ids ?? [])
    const actions = queue.filter((a) => ids.has(a.id))
    await recordFailures(matchId, actions.length > 0 ? actions : [null], r.error)
  }
  await set(baseKey(matchId), data.games ?? [])
  notify()
  return {
    conflict: false,
    synced: queue.length,
    error: rejected.length > 0 ? rejected[rejected.length - 1].error : undefined,
  }
}

/** Tira da fila e manda para as falhas (o servidor não vai aceitar). */
async function dropFromQueue(matchId: string, items: QueueAction[], reason: string) {
  const ids = new Set(items.map((a) => a.id))
  await recordFailures(matchId, items, reason)
  await update<QueueAction[]>(queueKey(matchId), (old) => (old ?? []).filter((a) => !ids.has(a.id)))
  notify()
}

/** Games finais que a fila vai deixar no servidor (último upsert de cada game). */
function queuedGames(queue: QueueAction[]): GameRow[] {
  const map = new Map<number, GameRow>()
  for (const a of queue) {
    if (a.type === 'upsert_game') {
      const g = a.payload as GameRow
      map.set(g.game_number, { game_number: g.game_number, score_a: g.score_a, score_b: g.score_b })
    } else if (a.type === 'finish_timer') {
      const p = a.payload as FinishTimerPayload
      map.set(1, { game_number: 1, score_a: p.score_a, score_b: p.score_b })
    }
  }
  return [...map.values()]
}

/** Partidas em conflito: o envio automático pausa até o organizador resolver. */
const conflicted = new Set<string>()

export function clearConflictPause(matchId: string): void {
  conflicted.delete(matchId)
}

async function flushOnce(matchId: string): Promise<FlushResult> {
  const queue = await getQueue(matchId)
  if (queue.length === 0) return { conflict: false, synced: 0 }

  const supabase = createClient()
  const deviceId = getDeviceId()

  // Renova o token se venceu enquanto o app estava offline (no-op se válido).
  try {
    await supabase.auth.getSession()
  } catch {
    return { conflict: false, synced: 0, stalled: true }
  }

  // Fase 2: uma chamada para a fila inteira.
  if (batchRpcUsable()) {
    const r = await flushBatch(supabase, matchId, deviceId, queue)
    if (r) return r
  }

  // Envio ação por ação (banco sem apply_match_ops).
  // Estado atual do servidor (status + games) — para conflito e base.
  let server: { status: string; match_games: GameRow[] | null } | null
  try {
    const { data, error } = await supabase
      .from('matches')
      .select('status, match_games(game_number, score_a, score_b)')
      .eq('id', matchId)
      .maybeSingle()
    // Qualquer falha na leitura: não sabemos o estado do servidor → tenta depois.
    if (error) return { conflict: false, synced: 0, stalled: true }
    server = data as typeof server
  } catch {
    return { conflict: false, synced: 0, stalled: true }
  }

  // Partida não existe mais (campeonato apagado/refeito): a fila não tem destino.
  // Vai inteira para falhas em vez de tentar para sempre.
  if (!server) {
    const reason = 'A partida não existe mais no servidor.'
    await dropFromQueue(matchId, queue, reason)
    return { conflict: false, synced: 0, error: reason }
  }

  const serverGames = server.match_games ?? []

  // Já está em revisão no servidor: aplicar agora reabriria a partida (o trigger
  // recalcula o status). Espera o organizador resolver.
  if (server.status === 'revisao') {
    conflicted.add(matchId)
    return { conflict: true, synced: 0 }
  }

  const base = (await get(baseKey(matchId))) as GameRow[] | undefined
  if (base && detectConflict(base, serverGames, queuedGames(queue))) {
    const { error: flagErr } = await supabase.rpc('flag_match_conflict', {
      _match_id: matchId,
      _server_snapshot: { games: serverGames },
    })
    if (!flagErr) {
      conflicted.add(matchId)
      return { conflict: true, synced: 0 }
    }
    if (isNetworkError(flagErr)) return { conflict: false, synced: 0, stalled: true }
    // Sem permissão para abrir revisão (não é organizador): o placar deste
    // aparelho prevalece — segue aplicando, sem travar a partida.
  }

  // Aplica em ordem. Upserts seguidos sobem num único pedido.
  const applied = new Set<string>()
  const rejected: { action: QueueAction; error: string }[] = []
  let stalled = false
  let i = 0
  while (i < queue.length) {
    let j = i + 1
    let outcome: Outcome
    if (queue[i].type === 'upsert_game') {
      while (j < queue.length && queue[j].type === 'upsert_game') j++
      const rows = new Map<number, GameRow>()
      for (const a of queue.slice(i, j)) {
        const g = a.payload as GameRow
        rows.set(g.game_number, g)
      }
      outcome = await upsertGames(supabase, matchId, deviceId, [...rows.values()])
    } else {
      outcome = await applyAction(supabase, matchId, deviceId, queue[i])
    }
    if (outcome.kind === 'retry') {
      stalled = true
      break
    }
    for (const a of queue.slice(i, j)) {
      applied.add(a.id)
      if (outcome.kind === 'rejected') rejected.push({ action: a, error: outcome.error })
    }
    i = j
  }

  if (applied.size > 0) {
    // Remove só o que foi processado, numa transação: itens enfileirados
    // durante o envio continuam na fila.
    await update<QueueAction[]>(queueKey(matchId), (old) => (old ?? []).filter((a) => !applied.has(a.id)))
    for (const r of rejected) await recordFailures(matchId, [r.action], r.error)

    // Nova base = servidor + o que acabamos de aplicar.
    const done = queue.filter((a) => applied.has(a.id) && !rejected.some((r) => r.action.id === a.id))
    const clears = done.some(
      (a) =>
        a.type === 'clear_match' ||
        (a.type === 'finalize_match' && kindOf(a.payload as FinalizePayload) !== 'result'),
    )
    const merged = new Map(serverGames.map((g) => [g.game_number, g]))
    for (const g of queuedGames(done)) merged.set(g.game_number, g)
    await set(baseKey(matchId), clears ? [] : [...merged.values()])
    notify()
  }

  return {
    conflict: false,
    synced: applied.size,
    stalled,
    error: rejected.length > 0 ? rejected[rejected.length - 1].error : undefined,
  }
}

// Um envio por partida: entre abas (Web Locks) e dentro da aba (promessa única;
// pedidos que chegam durante o envio geram mais uma passada no fim).
const running = new Map<string, Promise<FlushResult>>()
const again = new Set<string>()

function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (locks?.request) return locks.request(name, () => fn()) as Promise<T>
  return fn()
}

export function flush(matchId: string): Promise<FlushResult> {
  const current = running.get(matchId)
  if (current) {
    again.add(matchId)
    return current
  }
  const p = (async () => {
    let synced = 0
    let last: FlushResult = { conflict: false, synced: 0 }
    try {
      do {
        again.delete(matchId)
        last = await withLock(`sb-flush:${matchId}`, () => flushOnce(matchId))
        synced += last.synced
      } while (again.has(matchId) && !last.stalled && !last.conflict)
      return { ...last, synced }
    } catch {
      return { conflict: false, synced, stalled: true }
    } finally {
      running.delete(matchId)
      again.delete(matchId)
    }
  })()
  running.set(matchId, p)
  return p
}

// ─── finalizeMatch ────────────────────────────────────────────────────────────
// Encerra a partida online (RPC) ou enfileira a ação p/ o envio.

export type FinalizeOutcome = { error: string | null; queued: boolean }

export async function finalizeMatch(matchId: string, input: FinalizeInput): Promise<FinalizeOutcome> {
  const payload = toPayload(input)

  // Garante o placar parcial no servidor (no-op offline).
  await flush(matchId)

  // Chamada direta só com a fila vazia: com placar ainda pendente, o encerramento
  // precisa chegar DEPOIS dele (senão o placar tardio reabriria a partida).
  if (isOnline() && (await getQueue(matchId)).length === 0) {
    const { name, params } = finalizeRpc(matchId, payload)
    try {
      const { error } = await createClient().rpc(name, params)
      if (!error) {
        if (input.kind !== 'result') await set(baseKey(matchId), [])
        return { error: null, queued: false }
      }
      if (!isNetworkError(error)) return { error: error.message, queued: false }
    } catch (err) {
      if (!isNetworkError(err)) {
        return { error: err instanceof Error ? err.message : 'Não foi possível encerrar a partida.', queued: false }
      }
    }
  }

  await enqueue({ matchId, type: 'finalize_match', payload })
  void flush(matchId)
  return { error: null, queued: true }
}

// ─── finishTimer ──────────────────────────────────────────────────────────────
// Fim do cronômetro (contagem por tempo). Sempre pela fila: offline a partida
// aparece encerrada na hora e finaliza no servidor ao sincronizar.

export async function finishTimer(matchId: string, p: FinishTimerPayload): Promise<void> {
  await enqueue({ matchId, type: 'finish_timer', payload: p })
  void flush(matchId)
}

// ─── Reabrir / limpar / data ─────────────────────────────────────────────────
// Também pela fila: funcionam offline e chegam ao servidor na ordem certa
// (depois do placar e do encerramento que vieram antes).

export async function reopenMatch(matchId: string, isOrganizer: boolean): Promise<void> {
  await enqueue({ matchId, type: 'reopen_match', payload: { isOrganizer } })
  void flush(matchId)
}

export async function clearMatch(matchId: string): Promise<void> {
  await enqueue({ matchId, type: 'clear_match', payload: {} })
  void flush(matchId)
}

export async function setSchedule(matchId: string, at: string | null): Promise<void> {
  await enqueue({ matchId, type: 'set_schedule', payload: { at } })
  void flush(matchId)
}

// ─── pendingCount helper ──────────────────────────────────────────────────────

export async function getPendingCount(matchId: string): Promise<number> {
  const q = await getQueue(matchId)
  return q.length
}

// ─── Estado da fila (para telas/classificação offline) ────────────────────────
// Reconstrói o que a fila local ainda vai aplicar na partida: placar (upserts/
// deletes) e a finalização pendente. Retorna null se a fila estiver vazia.

export type QueuedMatchState = {
  /** games enfileirados (upserts) — sobrepõem os do snapshot */
  games: GameRow[]
  /** true quando há DQ/W.O./limpeza na fila: o servidor apaga os games, então o snapshot não vale */
  clearsGames: boolean
  finalization: { kind: FinalizeKind; result: string | null } | null
  /** partida reaberta ('em_andamento') ou limpa ('agendado') na fila, sem encerramento depois */
  statusOverride: 'em_andamento' | 'agendado' | null
  /**
   * Placar alterado depois do reabrir/limpar. O servidor só recalcula o
   * resultado (resolve_match) quando um game muda: reabrir sem mexer no placar
   * deixa a partida aberta.
   */
  gamesChangedAfterOverride?: boolean
  /** data definida na fila (undefined = não mexeu) */
  scheduledAt?: string | null
}

export function queuedStateOf(q: QueueAction[]): QueuedMatchState | null {
  if (q.length === 0) return null
  const map = new Map<number, GameRow>()
  let clearsGames = false
  let finalization: QueuedMatchState['finalization'] = null
  let statusOverride: QueuedMatchState['statusOverride'] = null
  let gamesChangedAfterOverride = false
  let scheduledAt: string | null | undefined
  for (const a of q) {
    if (a.type === 'upsert_game') {
      const g = a.payload as GameRow
      map.set(g.game_number, { game_number: g.game_number, score_a: g.score_a, score_b: g.score_b })
      gamesChangedAfterOverride = true
    } else if (a.type === 'delete_game') {
      map.delete((a.payload as { game_number: number }).game_number)
      gamesChangedAfterOverride = true
    } else if (a.type === 'finalize_match') {
      const p = a.payload as FinalizePayload
      const kind = kindOf(p)
      finalization = { kind, result: kind === 'double_wo' ? null : p.result }
      statusOverride = null
      if (kind !== 'result') {
        clearsGames = true
        map.clear()
      }
    } else if (a.type === 'finish_timer') {
      const p = a.payload as FinishTimerPayload
      map.set(1, { game_number: 1, score_a: p.score_a, score_b: p.score_b })
      const result = timerResult(p)
      if (result) {
        finalization = { kind: 'result', result }
        statusOverride = null
      }
    } else if (a.type === 'reopen_match') {
      finalization = null
      statusOverride = 'em_andamento'
      gamesChangedAfterOverride = false
    } else if (a.type === 'clear_match') {
      map.clear()
      clearsGames = true
      finalization = null
      statusOverride = 'agendado'
      gamesChangedAfterOverride = false
    } else if (a.type === 'set_schedule') {
      scheduledAt = (a.payload as { at: string | null }).at
    }
  }
  return {
    games: [...map.values()].sort((x, y) => x.game_number - y.game_number),
    clearsGames,
    finalization,
    statusOverride,
    gamesChangedAfterOverride,
    scheduledAt,
  }
}

export async function getQueuedMatchState(matchId: string): Promise<QueuedMatchState | null> {
  return queuedStateOf(await getQueue(matchId))
}

// ─── games da fila (para classificação offline) ───────────────────────────────
// Retorna null se não houver nada na fila para a partida.
export async function getQueuedGames(matchId: string): Promise<GameRow[] | null> {
  const state = await getQueuedMatchState(matchId)
  return state ? state.games : null
}

// ─── clearQueue ───────────────────────────────────────────────────────────────

export async function clearQueue(matchId: string): Promise<void> {
  await writers.get(matchId)
  await recoverJournal()
  await set(queueKey(matchId), [])
  await del(baseKey(matchId))
  clearConflictPause(matchId)
  notify()
}

// ─── Visão geral (tela de sincronização) ──────────────────────────────────────

export type PendingMatch = {
  matchId: string
  count: number
  meta: SyncMeta | null
  /** quando a pendência mais antiga foi lançada */
  since: number
}

export async function getPendingMatches(): Promise<PendingMatch[]> {
  await recoverJournal()
  const allKeys = (await keys()) as IDBValidKey[]
  const out: PendingMatch[] = []
  for (const k of allKeys) {
    if (typeof k !== 'string' || !k.startsWith('queue:')) continue
    const matchId = k.slice('queue:'.length)
    const q = ((await get(k)) as QueueAction[] | undefined) ?? []
    if (q.length === 0) continue
    out.push({
      matchId,
      count: q.length,
      meta: await getSyncMeta(matchId),
      since: Math.min(...q.map((a) => a.timestamp)),
    })
  }
  // Mais antigas primeiro: a partida de uma rodada é enviada antes da seguinte,
  // então o servidor já avançou o vencedor na chave quando chega a próxima.
  return out.sort((a, b) => a.since - b.since)
}

// ─── flushAllPending ──────────────────────────────────────────────────────────
// Envia todas as filas com pendências, uma partida por vez. Chamado ao abrir o
// app, ao voltar para ele e ao reconectar — placares gravados com o app fechado
// não se perdem. Retorna quantas partidas ainda ficaram com pendência.

export async function flushAllPending(): Promise<{ pending: number; stalled: boolean }> {
  if (!isOnline()) return { pending: (await getPendingMatches()).length, stalled: true }
  let pending = 0
  let stalled = false
  try {
    for (const { matchId } of await getPendingMatches()) {
      if (conflicted.has(matchId)) {
        pending++
        continue
      }
      const r = await flush(matchId)
      if (r.stalled) stalled = true
      if ((await getPendingCount(matchId)) > 0) pending++
    }
  } catch {
    /* best-effort: ignora erros de IDB */
  }
  return { pending, stalled }
}

/**
 * Sincronização em segundo plano para o app inteiro: ao abrir, ao voltar para
 * o app (no iOS o evento `online` falha com frequência), ao reconectar e, havendo
 * pendência, com espera crescente (2 s → 60 s). Retorna o cleanup.
 */
export function startBackgroundSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let delay = 2000
  let stopped = false
  let busy = false

  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer)
    if (!stopped) timer = setTimeout(run, ms)
  }

  async function run() {
    if (stopped || busy) return
    busy = true
    try {
      const { pending } = await flushAllPending()
      if (pending > 0) {
        schedule(delay)
        delay = Math.min(delay * 2, 60_000)
      } else {
        delay = 2000
      }
    } finally {
      busy = false
    }
  }

  const kick = () => {
    delay = 2000
    schedule(300)
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') kick()
  }

  window.addEventListener('online', kick)
  window.addEventListener('focus', kick)
  document.addEventListener('visibilitychange', onVisible)
  kick()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    window.removeEventListener('online', kick)
    window.removeEventListener('focus', kick)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

// ─── Auto-sync da tela de placar ──────────────────────────────────────────────

const trackedMatches = new Set<string>()

export function trackMatch(matchId: string): void {
  trackedMatches.add(matchId)
}

export function untrackMatch(matchId: string): void {
  trackedMatches.delete(matchId)
}

/**
 * Loop de envio enquanto uma tela de placar está aberta (3 s). Sem pendência,
 * cada volta só lê o IndexedDB — não toca a rede.
 * Retorna função de cleanup para chamar no useEffect return.
 */
export function startAutoSync(
  onFlushResult?: (matchId: string, result: FlushResult) => void,
): () => void {
  const runFlush = () => {
    if (!isOnline()) return
    for (const id of trackedMatches) {
      if (conflicted.has(id)) continue
      void flush(id).then((result) => {
        if (result.synced > 0 || result.conflict || result.error) onFlushResult?.(id, result)
      })
    }
  }

  const intervalId = setInterval(runFlush, 3000)
  window.addEventListener('online', runFlush)

  return () => {
    clearInterval(intervalId)
    window.removeEventListener('online', runFlush)
  }
}
