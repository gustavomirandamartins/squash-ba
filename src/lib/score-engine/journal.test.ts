import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clear, set } from 'idb-keyval'

vi.mock('@/utils/supabase/client', () => ({ createClient: () => ({}) }))

// localStorage em memória (o diário síncrono mora nele).
const mem = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  },
})

import * as Sync from './SyncEngine'

const M = 'match-journal'
const up = (id: string, timestamp: number, a: number, b: number): Sync.QueueAction => ({
  id, matchId: M, type: 'upsert_game', payload: { game_number: 1, score_a: a, score_b: b }, timestamp, deviceId: 'd',
})

beforeEach(async () => {
  await clear()
  mem.clear()
  Sync.__resetJournalRecovery()
})

describe('diário da fila', () => {
  it('toque que não chegou ao IndexedDB (app fechado na hora) volta para a fila', async () => {
    mem.set('sb-queue-journal', JSON.stringify([up('a', 100, 1, 0), up('b', 110, 2, 0)]))
    const st = await Sync.getQueuedMatchState(M)
    expect(st?.games).toEqual([{ game_number: 1, score_a: 2, score_b: 0 }])
    expect(mem.has('sb-queue-journal')).toBe(false)
  })

  it('não ressuscita ação antiga que já foi gravada (ou compactada)', async () => {
    await set(`queue:${M}`, [up('b', 200, 6, 3)])
    mem.set('sb-queue-journal', JSON.stringify([up('a', 100, 5, 3), up('b', 200, 6, 3), up('c', 300, 7, 3)]))
    const st = await Sync.getQueuedMatchState(M)
    expect(st?.games).toEqual([{ game_number: 1, score_a: 7, score_b: 3 }])
  })

  it('sequência rápida de toques: tudo gravado, fila compactada e diário limpo', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        Sync.enqueue({ matchId: M, type: 'upsert_game', payload: { game_number: 1, score_a: i + 1, score_b: 0 } }),
      ),
    )
    const st = await Sync.getQueuedMatchState(M)
    expect(st?.games).toEqual([{ game_number: 1, score_a: 20, score_b: 0 }])
    expect(await Sync.getPendingCount(M)).toBe(1)
    expect(mem.has('sb-queue-journal')).toBe(false)
  })

  it('cada toque vai ao diário antes de qualquer espera', () => {
    void Sync.enqueue({ matchId: M, type: 'upsert_game', payload: { game_number: 1, score_a: 1, score_b: 0 } })
    // síncrono: já está no diário, mesmo sem aguardar a gravação
    expect(JSON.parse(mem.get('sb-queue-journal') ?? '[]')).toHaveLength(1)
  })
})
