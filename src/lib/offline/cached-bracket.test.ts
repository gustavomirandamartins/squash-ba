import { describe, expect, it } from 'vitest'
import { effectiveMatches, withQueue } from './cached-bracket'
import { overlayQueuedState, type StageCfg } from '@/lib/standings/compute'
import type { CachedChamp, CachedMatch } from './champ-cache'
import type { QueuedMatchState } from '@/lib/score-engine/SyncEngine'

const stage: StageCfg = { counting: 'set', points_per_set: 11, win_by_two: true, set_draw_enabled: false, sets_to_play: 3 }

const q = (games: { game_number: number; score_a: number; score_b: number }[], extra: Partial<QueuedMatchState> = {}): QueuedMatchState => ({
  games,
  clearsGames: false,
  finalization: null,
  statusOverride: null,
  ...extra,
})

const side = (name: string | null) => ({ name, avatarUrl: null })

function match(id: string, round: number, slot: number | null, a: string | null, b: string | null, next: string | null = null): CachedMatch {
  return {
    id, round, bracketSlot: slot, groupId: null, status: 'agendado', result: null,
    sideAId: a, sideBId: b, sideA: side(a), sideB: side(b), winnerAdvancesTo: next, games: [],
    counting: 'set', setsToPlay: 3, pointsPerSet: 11, winByTwo: true, setDrawEnabled: false, timeMinutes: null,
  }
}

const champ = (matches: CachedMatch[]): CachedChamp => ({
  id: 'c', name: 'Copa', format: 'eliminatoria', canManage: true, matches,
  sides: { p1: side('p1'), p2: side('p2'), p3: side('p3'), p4: side('p4') },
})

describe('overlayQueuedState com fase', () => {
  const base = { games: [], status: 'agendado', result: null, isWo: false, isDoubleWo: false }

  it('placar que decide encerra a partida (como resolve_match)', () => {
    const st = overlayQueuedState(base, q([{ game_number: 1, score_a: 11, score_b: 3 }, { game_number: 2, score_a: 11, score_b: 9 }]), stage)
    expect(st).toMatchObject({ status: 'finalizado', result: 'lado_a' })
  })

  it('placar parcial: em andamento', () => {
    const st = overlayQueuedState(base, q([{ game_number: 1, score_a: 11, score_b: 3 }]), stage)
    expect(st).toMatchObject({ status: 'em_andamento', result: null })
  })

  it('sem fase não deduz o resultado (compatível)', () => {
    const st = overlayQueuedState(base, q([{ game_number: 1, score_a: 11, score_b: 3 }, { game_number: 2, score_a: 11, score_b: 9 }]))
    expect(st.status).toBe('agendado')
  })

  it('por tempo não encerra sozinho', () => {
    const st = overlayQueuedState(base, q([{ game_number: 1, score_a: 9, score_b: 3 }]), { ...stage, counting: 'tempo' })
    expect(st.status).toBe('agendado')
  })
})

describe('effectiveMatches', () => {
  it('vencedores avançam na chave offline e a final abre', () => {
    const c = champ([
      match('s1', 1, 1, 'p1', 'p2', 'f'),
      match('s2', 1, 2, 'p3', 'p4', 'f'),
      match('f', 2, 1, null, null),
    ])
    const queued = new Map<string, QueuedMatchState | null>([
      ['s1', q([{ game_number: 1, score_a: 11, score_b: 2 }, { game_number: 2, score_a: 11, score_b: 2 }])],
      ['s2', q([{ game_number: 1, score_a: 2, score_b: 11 }, { game_number: 2, score_a: 2, score_b: 11 }])],
    ])
    const out = effectiveMatches(c, queued)
    const f = out.find((m) => m.id === 'f')!
    expect(f.sideAId).toBe('p1')
    expect(f.sideBId).toBe('p4')
    expect(f.sideB.name).toBe('p4')
  })

  it('não sobrescreve vaga que o servidor já preencheu', () => {
    const fin = match('f', 2, 1, 'p2', null)
    const c = champ([match('s1', 1, 1, 'p1', 'p2', 'f'), match('s2', 1, 2, 'p3', 'p4', 'f'), fin])
    const queued = new Map([['s1', q([{ game_number: 1, score_a: 11, score_b: 2 }, { game_number: 2, score_a: 11, score_b: 2 }])]])
    const f = effectiveMatches(c, queued).find((m) => m.id === 'f')!
    expect(f.sideAId).toBe('p2')
    expect(f.sideBId).toBeNull()
  })

  it('reabrir na fila esvazia a vaga seguinte de novo', () => {
    const s1 = { ...match('s1', 1, 1, 'p1', 'p2', 'f'), status: 'finalizado', result: 'lado_a',
      games: [{ game_number: 1, score_a: 11, score_b: 2 }, { game_number: 2, score_a: 11, score_b: 2 }] }
    const c = champ([s1, match('s2', 1, 2, 'p3', 'p4', 'f'), match('f', 2, 1, null, null)])
    // reaberta sem mexer no placar: continua aberta (não reencerra sozinha)
    const reopened = withQueue(s1, q([], { statusOverride: 'em_andamento' }))
    expect(reopened.status).toBe('em_andamento')
    // placar corrigido depois de reabrir: 1×1, ainda em jogo
    const queued = new Map([['s1', q([{ game_number: 2, score_a: 5, score_b: 11 }], { statusOverride: 'em_andamento', gamesChangedAfterOverride: true })]])
    const eff = effectiveMatches(c, queued)
    expect(eff.find((m) => m.id === 's1')!.status).toBe('em_andamento')
    expect(eff.find((m) => m.id === 'f')!.sideAId).toBeNull()
  })

  it('placar corrigido depois de reabrir volta a decidir', () => {
    const s1 = { ...match('s1', 1, 1, 'p1', 'p2', 'f'), status: 'finalizado', result: 'lado_a',
      games: [{ game_number: 1, score_a: 11, score_b: 2 }, { game_number: 2, score_a: 11, score_b: 2 }] }
    const st = withQueue(s1, q([{ game_number: 1, score_a: 2, score_b: 11 }, { game_number: 2, score_a: 2, score_b: 11 }],
      { statusOverride: 'em_andamento', gamesChangedAfterOverride: true }))
    expect(st).toMatchObject({ status: 'finalizado', result: 'lado_b' })
  })

  it('cache antigo (sem lados) não quebra', () => {
    const c = { ...champ([match('s1', 1, 1, 'p1', 'p2', 'f'), match('f', 2, 1, null, null)]), sides: undefined }
    expect(effectiveMatches(c, new Map())).toHaveLength(2)
  })
})
