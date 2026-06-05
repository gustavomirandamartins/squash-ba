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

export type ActionType = 'upsert_game' | 'delete_game'

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
    const serverGames = (
      serverMatch.match_games as Array<{ game_number: number; score_a: number; score_b: number }>
    ) ?? []
    await supabase.rpc('flag_match_conflict', {
      _match_id: matchId,
      _server_snapshot: { games: serverGames },
    })
    return { conflict: true, synced: 0 }
  }

  // Aplica fila em ordem
  let synced = 0
  for (const action of queue) {
    if (action.type === 'upsert_game') {
      const { game_number, score_a, score_b } = action.payload as {
        game_number: number
        score_a: number
        score_b: number
      }
      const { error: upsertErr } = await supabase.from('match_games').upsert(
        { match_id: matchId, game_number, score_a, score_b, last_device_id: deviceId },
        { onConflict: 'match_id,game_number' },
      )
      if (!upsertErr) {
        // Atualiza last_device_id e status do match
        await supabase
          .from('matches')
          .update({ last_device_id: deviceId, status: 'em_andamento' })
          .eq('id', matchId)
          .eq('status', 'agendado') // só muda se ainda estava agendado (trigger cuida do resto)
        synced++
      }
    } else if (action.type === 'delete_game') {
      const { game_number } = action.payload as { game_number: number }
      await supabase
        .from('match_games')
        .delete()
        .eq('match_id', matchId)
        .eq('game_number', game_number)
      synced++
    }
  }

  // Limpa fila se tudo foi aplicado
  if (synced === queue.length) {
    await saveQueue(matchId, [])
  } else {
    // Remove apenas os itens aplicados (os primeiros `synced`)
    await saveQueue(matchId, queue.slice(synced))
  }

  return { conflict: false, synced }
}

// ─── pendingCount helper ──────────────────────────────────────────────────────

export async function getPendingCount(matchId: string): Promise<number> {
  const q = await getQueue(matchId)
  return q.length
}

// ─── games da fila (para classificação offline) ───────────────────────────────
// Reconstrói o estado atual dos games a partir da fila local (upserts/deletes).
// Retorna null se não houver nada na fila para a partida.
export async function getQueuedGames(
  matchId: string,
): Promise<Array<{ game_number: number; score_a: number; score_b: number }> | null> {
  const q = await getQueue(matchId)
  if (q.length === 0) return null
  const map = new Map<number, { game_number: number; score_a: number; score_b: number }>()
  for (const a of q) {
    if (a.type === 'upsert_game') {
      const { game_number, score_a, score_b } = a.payload as {
        game_number: number
        score_a: number
        score_b: number
      }
      map.set(game_number, { game_number, score_a, score_b })
    } else if (a.type === 'delete_game') {
      const { game_number } = a.payload as { game_number: number }
      map.delete(game_number)
    }
  }
  return [...map.values()].sort((x, y) => x.game_number - y.game_number)
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
