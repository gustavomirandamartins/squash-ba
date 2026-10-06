import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clear, get, set } from 'idb-keyval'

// ── Supabase falso: guarda games/status em memória e registra as chamadas ──
const h = vi.hoisted(() => {
  type Row = { game_number: number; score_a: number; score_b: number }
  const state = {
    exists: true,
    status: 'em_andamento',
    games: [] as Row[],
    duration: null as number | null,
    networkDown: false,
    upsertGate: null as Promise<void> | null,
    rejectUpsert: null as string | null,
    flagError: null as { message: string } | null,
    calls: [] as { op: string; detail?: unknown }[],
  }
  const netErr = { message: 'TypeError: Failed to fetch' }
  const client = {
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  state.calls.push({ op: 'select' })
                  if (state.networkDown) return { data: null, error: netErr }
                  return {
                    data: state.exists ? { status: state.status, match_games: [...state.games] } : null,
                    error: null,
                  }
                },
              }
            },
          }
        },
        async upsert(rows: Row | Row[]) {
          if (state.upsertGate) await state.upsertGate
          if (state.networkDown) return { error: netErr }
          if (state.rejectUpsert) return { error: { message: state.rejectUpsert } }
          const list = Array.isArray(rows) ? rows : [rows]
          state.calls.push({ op: `upsert:${table}`, detail: list.map((r) => r.game_number) })
          for (const r of list) {
            state.games = state.games.filter((g) => g.game_number !== r.game_number)
            state.games.push({ game_number: r.game_number, score_a: r.score_a, score_b: r.score_b })
          }
          return { error: null }
        },
        update(vals: { duration_seconds?: number }) {
          return {
            eq: async () => {
              if (state.networkDown) return { error: netErr }
              state.calls.push({ op: `update:${table}`, detail: vals })
              if (vals.duration_seconds !== undefined) state.duration = vals.duration_seconds
              return { error: null }
            },
          }
        },
      }
    },
    async rpc(name: string) {
      state.calls.push({ op: `rpc:${name}` })
      if (state.networkDown) return { error: netErr }
      if (name === 'flag_match_conflict' && state.flagError) return { error: state.flagError }
      return { error: null }
    },
  }
  return { state, client }
})

vi.mock('@/utils/supabase/client', () => ({ createClient: () => h.client }))

import * as Sync from './SyncEngine'

const M = 'match-1'
const up = (game_number: number, score_a: number, score_b: number) =>
  Sync.enqueue({ matchId: M, type: 'upsert_game', payload: { game_number, score_a, score_b } })

beforeEach(async () => {
  await clear()
  Object.assign(h.state, {
    exists: true,
    status: 'em_andamento',
    games: [],
    duration: null,
    networkDown: false,
    upsertGate: null,
    rejectUpsert: null,
    flagError: null,
    calls: [],
  })
})

describe('compactação', () => {
  it('guarda só o último placar de cada game', async () => {
    await up(1, 1, 0)
    await up(1, 2, 0)
    await up(2, 0, 1)
    await up(1, 3, 0)
    const q = (await get(`queue:${M}`)) as Sync.QueueAction[]
    expect(q.map((a) => a.payload)).toEqual([
      { game_number: 2, score_a: 0, score_b: 1 },
      { game_number: 1, score_a: 3, score_b: 0 },
    ])
  })

  it('não compacta por cima de um encerramento', async () => {
    await up(1, 11, 5)
    await Sync.enqueue({ matchId: M, type: 'finalize_match', payload: { result: 'lado_a', isOrganizer: true } })
    await up(1, 11, 6)
    const q = (await get(`queue:${M}`)) as Sync.QueueAction[]
    expect(q.map((a) => a.type)).toEqual(['upsert_game', 'finalize_match', 'upsert_game'])
  })
})

describe('envio', () => {
  it('envia games seguidos num único upsert', async () => {
    await up(1, 11, 4)
    await up(2, 5, 11)
    await up(3, 2, 0)
    const r = await Sync.flush(M)
    expect(r.synced).toBe(3)
    expect(h.state.calls.filter((c) => c.op === 'upsert:match_games')).toHaveLength(1)
    expect(await Sync.getPendingCount(M)).toBe(0)
  })

  it('não perde o toque feito durante o envio', async () => {
    await up(1, 1, 0)
    let release!: () => void
    h.state.upsertGate = new Promise((r) => { release = r })
    const sending = Sync.flush(M)
    await new Promise((r) => setTimeout(r, 10)) // envio parado no upsert
    await up(2, 0, 1) // toque durante o envio
    await up(1, 2, 0)
    release()
    h.state.upsertGate = null
    await sending
    await Sync.flush(M)
    expect(await Sync.getPendingCount(M)).toBe(0)
    expect(h.state.games.find((g) => g.game_number === 1)).toMatchObject({ score_a: 2, score_b: 0 })
    expect(h.state.games.find((g) => g.game_number === 2)).toMatchObject({ score_a: 0, score_b: 1 })
  })

  it('pedidos simultâneos viram um envio só', async () => {
    await up(1, 3, 2)
    const [a, b] = await Promise.all([Sync.flush(M), Sync.flush(M)])
    expect(a).toBe(b)
    expect(h.state.calls.filter((c) => c.op === 'upsert:match_games')).toHaveLength(1)
  })

  it('sem rede mantém a fila e envia depois', async () => {
    await up(1, 4, 4)
    h.state.networkDown = true
    const r = await Sync.flush(M)
    expect(r.stalled).toBe(true)
    expect(await Sync.getPendingCount(M)).toBe(1)
    h.state.networkDown = false
    await Sync.flush(M)
    expect(await Sync.getPendingCount(M)).toBe(0)
  })

  it('ação recusada sai da fila e vai para as falhas', async () => {
    await up(1, 1, 0)
    h.state.rejectUpsert = 'permission denied'
    const r = await Sync.flush(M)
    expect(r.error).toBe('permission denied')
    expect(await Sync.getPendingCount(M)).toBe(0)
    const f = await Sync.getFailures()
    expect(f).toHaveLength(1)
    expect(f[0].action?.type).toBe('upsert_game')
  })

  it('partida que não existe mais: fila vai para as falhas', async () => {
    await up(1, 1, 0)
    h.state.exists = false
    await Sync.flush(M)
    expect(await Sync.getPendingCount(M)).toBe(0)
    expect((await Sync.getFailures())[0].error).toMatch(/não existe/)
  })

  it('fim do cronômetro grava a duração antes do placar', async () => {
    await up(1, 7, 5)
    await Sync.finishTimer(M, { seconds: 900, score_a: 7, score_b: 5, drawAllowed: false })
    await Sync.flush(M)
    const ops = h.state.calls.map((c) => c.op).filter((o) => o !== 'select')
    expect(ops).toEqual(['upsert:match_games', 'update:matches', 'upsert:match_games'])
    expect(h.state.duration).toBe(900)
  })
})

describe('conflito', () => {
  it('detectConflict: só quando o mesmo game mudou nos dois lados', () => {
    const base = [{ game_number: 1, score_a: 3, score_b: 3 }]
    expect(Sync.detectConflict(base, [{ game_number: 1, score_a: 5, score_b: 3 }], [{ game_number: 1, score_a: 4, score_b: 3 }])).toBe(true)
    // servidor igual à base → sem conflito
    expect(Sync.detectConflict(base, base, [{ game_number: 1, score_a: 4, score_b: 3 }])).toBe(false)
    // outro aparelho mexeu em outro game → junta
    expect(Sync.detectConflict(base, [...base, { game_number: 2, score_a: 1, score_b: 0 }], [{ game_number: 1, score_a: 4, score_b: 3 }])).toBe(false)
    // os dois chegaram ao mesmo placar → sem conflito
    expect(Sync.detectConflict(base, [{ game_number: 1, score_a: 4, score_b: 3 }], [{ game_number: 1, score_a: 4, score_b: 3 }])).toBe(false)
  })

  it('toques do próprio aparelho nunca viram conflito', async () => {
    await Sync.rememberServerGames(M, [])
    for (let i = 1; i <= 5; i++) {
      await up(1, i, 0)
      await Sync.flush(M)
    }
    expect(h.state.calls.some((c) => c.op === 'rpc:flag_match_conflict')).toBe(false)
    expect(h.state.games[0]).toMatchObject({ score_a: 5 })
  })

  it('conflito real abre revisão e segura a fila', async () => {
    await set(`base:${M}`, [{ game_number: 1, score_a: 3, score_b: 3 }])
    h.state.games = [{ game_number: 1, score_a: 5, score_b: 3 }]
    await up(1, 4, 3)
    const r = await Sync.flush(M)
    expect(r.conflict).toBe(true)
    expect(await Sync.getPendingCount(M)).toBe(1)
  })

  it('sem permissão para revisão: o placar local prevalece, sem travar', async () => {
    await set(`base:${M}`, [{ game_number: 1, score_a: 3, score_b: 3 }])
    h.state.games = [{ game_number: 1, score_a: 5, score_b: 3 }]
    h.state.flagError = { message: 'sem permissao' }
    await up(1, 4, 3)
    const r = await Sync.flush(M)
    expect(r.conflict).toBe(false)
    expect(await Sync.getPendingCount(M)).toBe(0)
    expect(h.state.games[0]).toMatchObject({ score_a: 4 })
  })
})

describe('estado da fila (telas offline)', () => {
  it('fim do cronômetro mostra o resultado; empate sem permissão não finaliza', () => {
    const base = { id: 'x', matchId: M, timestamp: 0, deviceId: 'd' }
    const win = Sync.queuedStateOf([
      { ...base, type: 'finish_timer', payload: { seconds: 60, score_a: 3, score_b: 1, drawAllowed: false } },
    ])
    expect(win?.finalization).toEqual({ kind: 'result', result: 'lado_a' })
    const tie = Sync.queuedStateOf([
      { ...base, type: 'finish_timer', payload: { seconds: 60, score_a: 2, score_b: 2, drawAllowed: false } },
    ])
    expect(tie?.finalization).toBeNull()
  })
})
