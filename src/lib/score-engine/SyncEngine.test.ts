import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clear, get, set } from 'idb-keyval'

// ── Supabase falso: guarda a partida em memória e registra as chamadas ──
// `batch: true` simula o banco com a migração da Fase 2 (apply_match_ops);
// `batch: false` simula o banco antigo (a RPC não existe).
const h = vi.hoisted(() => {
  type Row = { game_number: number; score_a: number; score_b: number }
  const state = {
    batch: true,
    exists: true,
    status: 'em_andamento',
    games: [] as Row[],
    duration: null as number | null,
    scheduledAt: null as string | null,
    networkDown: false,
    upsertGate: null as Promise<void> | null,
    rejectUpsert: null as string | null,
    /** false = quem envia não é organizador (não abre revisão) */
    canManage: true,
    calls: [] as { op: string; detail?: unknown }[],
  }
  const netErr = { message: 'TypeError: Failed to fetch' }
  const upsertRows = (list: Row[]) => {
    for (const r of list) {
      state.games = state.games.filter((g) => g.game_number !== r.game_number)
      state.games.push({ game_number: r.game_number, score_a: r.score_a, score_b: r.score_b })
    }
    state.games.sort((a, b) => a.game_number - b.game_number)
  }
  const same = (x?: Row, y?: Row) => (x?.score_a ?? 0) === (y?.score_a ?? 0) && (x?.score_b ?? 0) === (y?.score_b ?? 0)

  // Espelho de public.apply_match_ops (supabase/migrations/20261006120000_offline_fase2.sql)
  async function applyMatchOps(p: { _ops: { type: string; ids: string[]; [k: string]: unknown }[]; _base: Row[] | null; _local: Row[] | null }) {
    if (state.upsertGate) await state.upsertGate
    if (!state.exists) return { status: 'missing' }
    if (state.status === 'revisao') return { status: 'conflict' }
    if (state.canManage && p._base && p._local) {
      const conflict = p._local.some((l) => {
        const sv = state.games.find((g) => g.game_number === l.game_number)
        const bv = p._base!.find((g) => g.game_number === l.game_number)
        return !same(sv, bv) && !same(sv, l)
      })
      if (conflict) {
        state.status = 'revisao'
        return { status: 'conflict' }
      }
    }
    const rejected: { ids: string[]; error: string }[] = []
    for (const op of p._ops) {
      state.calls.push({ op: `op:${op.type}`, detail: op })
      if (op.type === 'upsert_games') {
        if (state.rejectUpsert) { rejected.push({ ids: op.ids, error: state.rejectUpsert }); continue }
        upsertRows(op.games as Row[])
      } else if (op.type === 'finish_timer') {
        state.duration = op.seconds as number
        upsertRows([{ game_number: 1, score_a: op.score_a as number, score_b: op.score_b as number }])
      } else if (op.type === 'finalize') {
        state.status = 'finalizado'
      } else if (op.type === 'reopen') {
        state.status = 'em_andamento'
      } else if (op.type === 'clear') {
        state.games = []
        state.status = 'agendado'
      } else if (op.type === 'schedule') {
        state.scheduledAt = op.at as string | null
      }
    }
    return { status: 'ok', rejected, games: [...state.games] }
  }

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
          upsertRows(list)
          return { error: null }
        },
        update(vals: { duration_seconds?: number; scheduled_at?: string | null; status?: string }) {
          const run = async () => {
            if (state.networkDown) return { error: netErr }
            state.calls.push({ op: `update:${table}`, detail: vals })
            if (vals.duration_seconds !== undefined) state.duration = vals.duration_seconds
            if (vals.scheduled_at !== undefined) state.scheduledAt = vals.scheduled_at
            if (vals.status) state.status = vals.status
            return { error: null }
          }
          const chain = { eq: () => Object.assign(run(), chain) }
          return chain
        },
      }
    },
    async rpc(name: string, params: Record<string, unknown>) {
      state.calls.push({ op: `rpc:${name}` })
      if (state.networkDown) return { data: null, error: netErr }
      if (name === 'apply_match_ops') {
        if (!state.batch) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.apply_match_ops' } }
        return { data: await applyMatchOps(params as never), error: null }
      }
      if (name === 'flag_match_conflict') {
        if (!state.canManage) return { data: null, error: { message: 'sem permissao' } }
        state.status = 'revisao'
      }
      if (name === 'reset_match_data') { state.games = []; state.status = 'agendado' }
      return { data: null, error: null }
    },
  }
  return { state, client }
})

vi.mock('@/utils/supabase/client', () => ({ createClient: () => h.client }))

import * as Sync from './SyncEngine'

const M = 'match-1'
const up = (game_number: number, score_a: number, score_b: number) =>
  Sync.enqueue({ matchId: M, type: 'upsert_game', payload: { game_number, score_a, score_b } })
const pending = () => Sync.getPendingCount(M)
const calls = (op: string) => h.state.calls.filter((c) => c.op === op).length

beforeEach(async () => {
  await clear()
  Sync.__resetBatchProbe()
  Sync.clearConflictPause(M)
  Object.assign(h.state, {
    batch: true,
    exists: true,
    status: 'em_andamento',
    games: [],
    duration: null,
    scheduledAt: null,
    networkDown: false,
    upsertGate: null,
    rejectUpsert: null,
    canManage: true,
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

  it('não compacta por cima de um encerramento ou de uma reabertura', async () => {
    await up(1, 11, 5)
    await Sync.enqueue({ matchId: M, type: 'finalize_match', payload: { result: 'lado_a', isOrganizer: true } })
    await up(1, 11, 6)
    await Sync.enqueue({ matchId: M, type: 'reopen_match', payload: { isOrganizer: true } })
    await up(1, 11, 7)
    const q = (await get(`queue:${M}`)) as Sync.QueueAction[]
    expect(q.map((a) => a.type)).toEqual(['upsert_game', 'finalize_match', 'upsert_game', 'reopen_match', 'upsert_game'])
  })

  it('limpar descarta o que veio antes; data guarda só a última', async () => {
    await up(1, 5, 5)
    await Sync.enqueue({ matchId: M, type: 'set_schedule', payload: { at: '2026-10-01T12:00:00Z' } })
    await Sync.enqueue({ matchId: M, type: 'finalize_match', payload: { result: 'lado_a', isOrganizer: true } })
    await Sync.enqueue({ matchId: M, type: 'set_schedule', payload: { at: '2026-10-02T12:00:00Z' } })
    await Sync.enqueue({ matchId: M, type: 'clear_match', payload: {} })
    const q = (await get(`queue:${M}`)) as Sync.QueueAction[]
    expect(q.map((a) => a.type)).toEqual(['set_schedule', 'clear_match'])
    expect(q[0].payload).toEqual({ at: '2026-10-02T12:00:00Z' })
  })

  it('lote: upserts seguidos viram uma operação', () => {
    const base = { matchId: M, timestamp: 0, deviceId: 'd' }
    const ops = Sync.buildBatchOps([
      { ...base, id: 'a', type: 'upsert_game', payload: { game_number: 1, score_a: 1, score_b: 0 } },
      { ...base, id: 'b', type: 'upsert_game', payload: { game_number: 2, score_a: 0, score_b: 1 } },
      { ...base, id: 'c', type: 'finalize_match', payload: { result: 'lado_a', isOrganizer: true, isWo: true } },
      { ...base, id: 'd', type: 'set_schedule', payload: { at: null } },
    ])
    expect(ops).toEqual([
      { type: 'upsert_games', ids: ['a', 'b'], games: [{ game_number: 1, score_a: 1, score_b: 0 }, { game_number: 2, score_a: 0, score_b: 1 }] },
      { type: 'finalize', ids: ['c'], kind: 'wo', result: 'lado_a' },
      { type: 'schedule', ids: ['d'], at: null },
    ])
  })
})

// Mesmas garantias nos dois caminhos de envio.
for (const mode of ['lote', 'ação a ação'] as const) {
  describe(`envio (${mode})`, () => {
    beforeEach(() => {
      h.state.batch = mode === 'lote'
    })

    it('envia a fila inteira e esvazia', async () => {
      await up(1, 11, 4)
      await up(2, 5, 11)
      await up(3, 2, 0)
      const r = await Sync.flush(M)
      expect(r.synced).toBe(3)
      expect(await pending()).toBe(0)
      expect(h.state.games).toHaveLength(3)
      if (mode === 'lote') {
        expect(calls('rpc:apply_match_ops')).toBe(1)
        expect(calls('select')).toBe(0)
      } else {
        expect(calls('upsert:match_games')).toBe(1)
      }
    })

    it('não perde o toque feito durante o envio', async () => {
      await up(1, 1, 0)
      let release!: () => void
      h.state.upsertGate = new Promise((r) => { release = r })
      const sending = Sync.flush(M)
      await new Promise((r) => setTimeout(r, 10)) // envio parado no meio
      await up(2, 0, 1) // toques durante o envio
      await up(1, 2, 0)
      release()
      h.state.upsertGate = null
      await sending
      await Sync.flush(M)
      expect(await pending()).toBe(0)
      expect(h.state.games.find((g) => g.game_number === 1)).toMatchObject({ score_a: 2, score_b: 0 })
      expect(h.state.games.find((g) => g.game_number === 2)).toMatchObject({ score_a: 0, score_b: 1 })
    })

    it('pedidos simultâneos viram um envio só', async () => {
      await up(1, 3, 2)
      const [a, b] = await Promise.all([Sync.flush(M), Sync.flush(M)])
      expect(a).toBe(b)
      expect(calls(mode === 'lote' ? 'rpc:apply_match_ops' : 'upsert:match_games')).toBe(1)
    })

    it('sem rede mantém a fila e envia depois', async () => {
      await up(1, 4, 4)
      h.state.networkDown = true
      const r = await Sync.flush(M)
      expect(r.stalled).toBe(true)
      expect(await pending()).toBe(1)
      h.state.networkDown = false
      await Sync.flush(M)
      expect(await pending()).toBe(0)
    })

    it('ação recusada sai da fila e vai para as falhas', async () => {
      await up(1, 1, 0)
      h.state.rejectUpsert = 'permission denied'
      const r = await Sync.flush(M)
      expect(r.error).toBe('permission denied')
      expect(await pending()).toBe(0)
      const f = await Sync.getFailures()
      expect(f).toHaveLength(1)
      expect(f[0].action?.type).toBe('upsert_game')
    })

    it('partida que não existe mais: fila vai para as falhas', async () => {
      await up(1, 1, 0)
      h.state.exists = false
      await Sync.flush(M)
      expect(await pending()).toBe(0)
      expect((await Sync.getFailures())[0].error).toMatch(/não existe/)
    })

    it('fim do cronômetro grava a duração e o placar final', async () => {
      await up(1, 7, 5)
      await Sync.finishTimer(M, { seconds: 900, score_a: 7, score_b: 5, drawAllowed: false })
      await Sync.flush(M)
      expect(h.state.duration).toBe(900)
      expect(await pending()).toBe(0)
      if (mode === 'ação a ação') {
        const ops = h.state.calls.map((c) => c.op).filter((o) => o.startsWith('upsert') || o.startsWith('update'))
        expect(ops).toEqual(['upsert:match_games', 'update:matches', 'upsert:match_games'])
      }
    })

    it('reabrir, limpar e mudar a data chegam ao servidor em ordem', async () => {
      h.state.status = 'finalizado'
      await Sync.reopenMatch(M, true)
      await Sync.flush(M)
      expect(h.state.status).toBe('em_andamento')
      await up(1, 3, 3)
      await Sync.setSchedule(M, '2026-10-06T12:00:00.000Z')
      await Sync.flush(M)
      expect(h.state.scheduledAt).toBe('2026-10-06T12:00:00.000Z')
      await Sync.clearMatch(M)
      await Sync.flush(M)
      expect(h.state.games).toEqual([])
      expect(h.state.status).toBe('agendado')
      expect(await pending()).toBe(0)
    })

    it('toques do próprio aparelho nunca viram conflito', async () => {
      await Sync.rememberServerGames(M, [])
      for (let i = 1; i <= 5; i++) {
        await up(1, i, 0)
        await Sync.flush(M)
      }
      expect(h.state.status).not.toBe('revisao')
      expect(h.state.games[0]).toMatchObject({ score_a: 5 })
    })

    it('conflito real abre revisão e segura a fila', async () => {
      await set(`base:${M}`, [{ game_number: 1, score_a: 3, score_b: 3 }])
      h.state.games = [{ game_number: 1, score_a: 5, score_b: 3 }]
      await up(1, 4, 3)
      const r = await Sync.flush(M)
      expect(r.conflict).toBe(true)
      expect(h.state.status).toBe('revisao')
      expect(await pending()).toBe(1)
    })

    it('sem permissão para revisão: o placar local prevalece, sem travar', async () => {
      await set(`base:${M}`, [{ game_number: 1, score_a: 3, score_b: 3 }])
      h.state.games = [{ game_number: 1, score_a: 5, score_b: 3 }]
      h.state.canManage = false
      await up(1, 4, 3)
      const r = await Sync.flush(M)
      expect(r.conflict).toBe(false)
      expect(await pending()).toBe(0)
      expect(h.state.games[0]).toMatchObject({ score_a: 4 })
    })
  })
}

describe('banco sem a migração da Fase 2', () => {
  it('cai no envio ação a ação e não insiste na RPC', async () => {
    h.state.batch = false
    await up(1, 1, 0)
    await Sync.flush(M)
    await up(1, 2, 0)
    await Sync.flush(M)
    expect(calls('rpc:apply_match_ops')).toBe(1)
    expect(h.state.games[0]).toMatchObject({ score_a: 2 })
  })
})

describe('estado da fila (telas offline)', () => {
  const base = { matchId: M, timestamp: 0, deviceId: 'd' }

  it('fim do cronômetro mostra o resultado; empate sem permissão não finaliza', () => {
    const win = Sync.queuedStateOf([
      { ...base, id: 'x', type: 'finish_timer', payload: { seconds: 60, score_a: 3, score_b: 1, drawAllowed: false } },
    ])
    expect(win?.finalization).toEqual({ kind: 'result', result: 'lado_a' })
    const tie = Sync.queuedStateOf([
      { ...base, id: 'x', type: 'finish_timer', payload: { seconds: 60, score_a: 2, score_b: 2, drawAllowed: false } },
    ])
    expect(tie?.finalization).toBeNull()
  })

  it('reabrir depois de encerrar deixa a partida em andamento', () => {
    const st = Sync.queuedStateOf([
      { ...base, id: 'a', type: 'finalize_match', payload: { result: 'lado_a', isOrganizer: true } },
      { ...base, id: 'b', type: 'reopen_match', payload: { isOrganizer: true } },
    ])
    expect(st?.finalization).toBeNull()
    expect(st?.statusOverride).toBe('em_andamento')
    expect(st?.gamesChangedAfterOverride).toBe(false)
  })

  it('placar mexido depois de reabrir fica marcado', () => {
    const st = Sync.queuedStateOf([
      { ...base, id: 'a', type: 'reopen_match', payload: { isOrganizer: true } },
      { ...base, id: 'b', type: 'upsert_game', payload: { game_number: 2, score_a: 5, score_b: 3 } },
    ])
    expect(st?.gamesChangedAfterOverride).toBe(true)
  })

  it('pendências saem da mais antiga para a mais nova (rodada antes da seguinte)', async () => {
    const act = (matchId: string, timestamp: number) => ({
      id: `${matchId}-${timestamp}`, matchId, timestamp, deviceId: 'd',
      type: 'upsert_game' as const, payload: { game_number: 1, score_a: 1, score_b: 0 },
    })
    await set('queue:final', [act('final', 300)])
    await set('queue:semi2', [act('semi2', 250), act('semi2', 120)])
    await set('queue:semi1', [act('semi1', 100)])
    const order = (await Sync.getPendingMatches()).map((p) => p.matchId)
    expect(order).toEqual(['semi1', 'semi2', 'final'])
  })
})
