/**
 * SyncEngine — fila offline para ações de placar.
 *
 * Cada jogo aberto registra-se com trackMatch(matchId).
 * Ações são persistidas em IndexedDB via idb-keyval (chave `queue:<matchId>`).
 * flush() sincroniza com o Supabase quando online, detecta conflitos e
 * invoca flag_match_conflict quando necessário.
 * startAutoSync() dispara flush a cada 3 s enquanto online.
 */

import { get, set, keys } from 'idb-keyval'
import { createClient } from '@/utils/supabase/client'
import { getDeviceId } from './deviceId'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ActionType = 'upsert_game' | 'delete_game' | 'finalize_match'

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
  /** Ação recusada pelo servidor (permissão, regra de negócio…) — descartada da fila. */
  error?: string
}

type GameRow = { game_number: number; score_a: number; score_b: number }

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

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

/**
 * Falha de rede? O supabase-js NÃO lança em fetch falho — devolve `{ error }` com
 * a mensagem do TypeError ("Failed to fetch", "Load failed"…). Com sinal fraco o
 * `navigator.onLine` segue true, então checar só ele deixa a ação se perder.
 */
export function isNetworkError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err ?? '')
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|internet connection/i.test(msg)
}

// ─── Helpers de IDB ───────────────────────────────────────────────────────────

function queueKey(matchId: string): string {
  return `queue:${matchId}`
}

async function getQueue(matchId: string): Promise<QueueAction[]> {
  return ((await get(queueKey(matchId))) as QueueAction[] | undefined) ?? []
}

async function saveQueue(matchId: string, queue: QueueAction[]): Promise<void> {
  await set(queueKey(matchId), queue)
}

// ─── enqueue ─────────────────────────────────────────────────────────────────

export async function enqueue(
  action: Pick<QueueAction, 'matchId' | 'type' | 'payload'>,
): Promise<void> {
  const queue = await getQueue(action.matchId)
  const item: QueueAction = {
    id: crypto.randomUUID(),
    matchId: action.matchId,
    type: action.type,
    payload: action.payload,
    timestamp: Date.now(),
    deviceId: getDeviceId(),
  }
  await saveQueue(action.matchId, [...queue, item])
}

// ─── flush ────────────────────────────────────────────────────────────────────

// ok       → aplicada
// retry    → falha de rede: mantém na fila e tenta de novo depois
// rejected → o servidor recusou (permissão/regra): descarta p/ não travar a fila
type Outcome = { kind: 'ok' } | { kind: 'retry' } | { kind: 'rejected'; error: string }

async function applyAction(
  supabase: ReturnType<typeof createClient>,
  matchId: string,
  deviceId: string,
  action: QueueAction,
): Promise<Outcome> {
  try {
    if (action.type === 'upsert_game') {
      const { game_number, score_a, score_b } = action.payload as GameRow
      const { error } = await supabase.from('match_games').upsert(
        { match_id: matchId, game_number, score_a, score_b, last_device_id: deviceId },
        { onConflict: 'match_id,game_number' },
      )
      if (error) return isNetworkError(error) ? { kind: 'retry' } : { kind: 'rejected', error: error.message }
      // Atualiza last_device_id e status do match
      await supabase
        .from('matches')
        .update({ last_device_id: deviceId, status: 'em_andamento' })
        .eq('id', matchId)
        .eq('status', 'agendado') // só muda se ainda estava agendado (trigger cuida do resto)
      return { kind: 'ok' }
    }

    if (action.type === 'delete_game') {
      const { game_number } = action.payload as { game_number: number }
      const { error } = await supabase
        .from('match_games')
        .delete()
        .eq('match_id', matchId)
        .eq('game_number', game_number)
      if (error) return isNetworkError(error) ? { kind: 'retry' } : { kind: 'rejected', error: error.message }
      return { kind: 'ok' }
    }

    if (action.type === 'finalize_match') {
      const { name, params } = finalizeRpc(matchId, action.payload as FinalizePayload)
      const { error } = await supabase.rpc(name, params)
      if (error) return isNetworkError(error) ? { kind: 'retry' } : { kind: 'rejected', error: error.message }
      return { kind: 'ok' }
    }
  } catch (err) {
    if (isNetworkError(err)) return { kind: 'retry' }
    return { kind: 'rejected', error: err instanceof Error ? err.message : 'erro desconhecido' }
  }
  return { kind: 'ok' }
}

export async function flush(matchId: string): Promise<FlushResult> {
  const queue = await getQueue(matchId)
  if (queue.length === 0) return { conflict: false, synced: 0 }

  const supabase = createClient()
  const deviceId = getDeviceId()

  // Fetch estado atual do servidor
  const { data: serverMatch, error } = await supabase
    .from('matches')
    .select('updated_at, last_device_id, match_games(game_number, score_a, score_b)')
    .eq('id', matchId)
    .single()

  if (error || !serverMatch) return { conflict: false, synced: 0 }

  // Detecção de conflito: servidor foi atualizado por outro dispositivo
  // depois do primeiro item da nossa fila local
  const serverUpdatedAt = new Date(serverMatch.updated_at as string).getTime()
  const firstLocalTs = queue[0].timestamp
  const serverDevice = serverMatch.last_device_id as string | null

  if (serverDevice && serverDevice !== deviceId && serverUpdatedAt > firstLocalTs) {
    // Conflito: grava snapshot do servidor e marca match como 'revisao'
    const serverGames = (serverMatch.match_games as GameRow[]) ?? []
    await supabase.rpc('flag_match_conflict', {
      _match_id: matchId,
      _server_snapshot: { games: serverGames },
    })
    return { conflict: true, synced: 0 }
  }

  // Aplica a fila em ordem; para no primeiro item que falhar por rede.
  let synced = 0
  let rejection: string | undefined
  for (const action of queue) {
    const outcome = await applyAction(supabase, matchId, deviceId, action)
    if (outcome.kind === 'retry') break
    if (outcome.kind === 'rejected') rejection = outcome.error
    synced++
  }

  // Remove só o que foi aplicado. Relê a fila: itens enfileirados durante o flush
  // (ex.: novo toque no placar, ou "encerrar partida") não podem ser perdidos.
  if (synced > 0) {
    const applied = new Set(queue.slice(0, synced).map((a) => a.id))
    const latest = await getQueue(matchId)
    await saveQueue(matchId, latest.filter((a) => !applied.has(a.id)))
  }

  return { conflict: false, synced, error: rejection }
}

// ─── finalizeMatch ────────────────────────────────────────────────────────────
// Encerra a partida online (RPC) ou, sem rede, enfileira a ação p/ o flush.
// Substitui o bloco que cada botão da tela repetia (encerrar, DQ, W.O., W.O. duplo).

export type FinalizeOutcome = { error: string | null; queued: boolean }

export async function finalizeMatch(matchId: string, input: FinalizeInput): Promise<FinalizeOutcome> {
  const payload = toPayload(input)

  // Garante o placar parcial no servidor (no-op offline).
  try { await flush(matchId) } catch { /* fica na fila */ }

  if (isOnline()) {
    const { name, params } = finalizeRpc(matchId, payload)
    try {
      const { error } = await createClient().rpc(name, params)
      if (!error) {
        // DQ/W.O. apagam os games no servidor: placar antigo na fila não pode ressuscitá-los.
        if (input.kind !== 'result') await clearQueue(matchId)
        return { error: null, queued: false }
      }
      if (!isNetworkError(error)) return { error: error.message, queued: false }
    } catch (err) {
      if (!isNetworkError(err)) {
        return { error: err instanceof Error ? err.message : 'Não foi possível encerrar a partida.', queued: false }
      }
    }
  }

  // Sem rede (ou falha de rede): grava na fila e tenta sincronizar quando der.
  await enqueue({ matchId, type: 'finalize_match', payload })
  try { await flush(matchId) } catch { /* idem */ }
  return { error: null, queued: true }
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
  /** true quando há DQ/W.O. na fila: o servidor apaga os games, então o snapshot não vale */
  clearsGames: boolean
  finalization: { kind: FinalizeKind; result: string | null } | null
}

export async function getQueuedMatchState(matchId: string): Promise<QueuedMatchState | null> {
  const q = await getQueue(matchId)
  if (q.length === 0) return null
  const map = new Map<number, GameRow>()
  let clearsGames = false
  let finalization: QueuedMatchState['finalization'] = null
  for (const a of q) {
    if (a.type === 'upsert_game') {
      const g = a.payload as GameRow
      map.set(g.game_number, { game_number: g.game_number, score_a: g.score_a, score_b: g.score_b })
    } else if (a.type === 'delete_game') {
      map.delete((a.payload as { game_number: number }).game_number)
    } else if (a.type === 'finalize_match') {
      const p = a.payload as FinalizePayload
      const kind = kindOf(p)
      finalization = { kind, result: kind === 'double_wo' ? null : p.result }
      if (kind !== 'result') {
        clearsGames = true
        map.clear()
      }
    }
  }
  return {
    games: [...map.values()].sort((x, y) => x.game_number - y.game_number),
    clearsGames,
    finalization,
  }
}

// ─── games da fila (para classificação offline) ───────────────────────────────
// Retorna null se não houver nada na fila para a partida.
export async function getQueuedGames(matchId: string): Promise<GameRow[] | null> {
  const state = await getQueuedMatchState(matchId)
  return state ? state.games : null
}

// ─── clearQueue ───────────────────────────────────────────────────────────────

export async function clearQueue(matchId: string): Promise<void> {
  await saveQueue(matchId, [])
}

// ─── flushAllPending ──────────────────────────────────────────────────────────
// Escaneia todo o IDB em busca de filas `queue:*` com itens pendentes e as
// sincroniza. Chamado no startup do app e ao reconectar, independentemente de
// qual tela o usuário está — garante que placares offline não se percam mesmo
// que o app tenha sido fechado antes de sincronizar.

export async function flushAllPending(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return
  try {
    const allKeys = (await keys()) as string[]
    const queueKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith('queue:'))
    await Promise.allSettled(
      queueKeys.map(async (key) => {
        const matchId = (key as string).slice('queue:'.length)
        const queue = (await get(key)) as QueueAction[] | undefined
        if (!queue || queue.length === 0) return
        await flush(matchId)
      }),
    )
  } catch {
    /* best-effort: ignora erros de IDB */
  }
}

// ─── Auto-sync ────────────────────────────────────────────────────────────────

const trackedMatches = new Set<string>()

export function trackMatch(matchId: string): void {
  trackedMatches.add(matchId)
}

export function untrackMatch(matchId: string): void {
  trackedMatches.delete(matchId)
}

/**
 * Inicia o loop de sync automático (3 s).
 * Retorna função de cleanup para chamar no useEffect return.
 */
export function startAutoSync(
  onFlushResult?: (matchId: string, result: FlushResult) => void,
): () => void {
  let intervalId: ReturnType<typeof setInterval> | null = null

  const runFlush = () => {
    if (!navigator.onLine) return
    for (const id of trackedMatches) {
      void flush(id).then((result) => {
        onFlushResult?.(id, result)
      })
    }
  }

  const start = () => {
    if (intervalId) clearInterval(intervalId)
    intervalId = setInterval(runFlush, 3000)
  }

  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  const onOnline = () => {
    start()
    // Flush imediato ao reconectar
    for (const id of trackedMatches) {
      void flush(id).then((result) => {
        onFlushResult?.(id, result)
      })
    }
  }

  const onOffline = () => stop()

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    start()
  }

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)

  return () => {
    stop()
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  }
}
