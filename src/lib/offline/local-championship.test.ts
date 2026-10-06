import { describe, expect, it } from 'vitest'
import {
  buildLocalEliminatoria,
  buildLocalGrupos,
  maybeGenerateBracketFromGroups,
  propagateBracketAdvances,
  type LocalChampionship,
  type LocalMatch,
} from './local-championship'
import type { StageCfg } from '@/lib/standings/compute'

const stage: StageCfg = { counting: 'set', points_per_set: 11, win_by_two: true, set_draw_enabled: false, sets_to_play: 1 }
const champCfg = { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, tiebreakers: [] }
const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ userIds: [`u${i + 1}`], name: `P${i + 1}`, avatarUrl: null, seed: null }))

function finish(m: LocalMatch, winner: 'lado_a' | 'lado_b') {
  m.games = [{ game_number: 1, score_a: winner === 'lado_a' ? 11 : 5, score_b: winner === 'lado_a' ? 5 : 11 }]
  m.status = 'finalizado'
  m.result = winner
}

const nameOf = (c: LocalChampionship, id: string | null) => c.participants.find((p) => p.id === id)?.name ?? null

describe('chave provisória', () => {
  it('trocar o vencedor de uma semifinal corrige a final', () => {
    const c = buildLocalEliminatoria('t', {
      name: 'x', startDate: null, unit: 'player', stage, champ: champCfg, hasThirdPlace: false, participants: people(4),
    })
    const semis = c.matches.filter((m) => m.round === 1)
    const final = c.matches.find((m) => m.round === 2)!
    finish(semis[0], 'lado_a')
    propagateBracketAdvances(c)
    expect(final.sideA).toBe(semis[0].sideA)

    // reabre, a final já tinha placar com o vencedor antigo
    finish(semis[1], 'lado_a')
    propagateBracketAdvances(c)
    finish(final, 'lado_a')
    finish(semis[0], 'lado_b')
    expect(propagateBracketAdvances(c)).toBe(true)
    expect(final.sideA).toBe(semis[0].sideB)
    expect(final.status).toBe('agendado')
    expect(final.games).toEqual([])
  })

  it('partida reaberta (sem resultado) esvazia o lado seguinte', () => {
    const c = buildLocalEliminatoria('t', {
      name: 'x', startDate: null, unit: 'player', stage, champ: champCfg, hasThirdPlace: false, participants: people(4),
    })
    const semi = c.matches.find((m) => m.round === 1)!
    const final = c.matches.find((m) => m.round === 2)!
    finish(semi, 'lado_a')
    propagateBracketAdvances(c)
    semi.status = 'em_andamento'
    semi.result = null
    propagateBracketAdvances(c)
    expect(final.sideA).toBeNull()
  })

  it('byes continuam avançando sozinhos', () => {
    const c = buildLocalEliminatoria('t', {
      name: 'x', startDate: null, unit: 'player', stage, champ: champCfg, hasThirdPlace: false, participants: people(3 + 2),
    })
    // 5 jogadores → chave de 8 com 3 byes já propagados na criação
    const r2 = c.matches.filter((m) => m.round === 2)
    const filled = r2.flatMap((m) => [m.sideA, m.sideB]).filter(Boolean)
    expect(filled.length).toBe(3)
    expect(propagateBracketAdvances(c)).toBe(false)
  })
})

describe('grupos → chave', () => {
  function grupos() {
    return buildLocalGrupos('g', {
      name: 'x', startDate: null, unit: 'player', groupsStage: stage, elimStage: stage, champ: champCfg,
      hasThirdPlace: false, numGroups: 2, rounds: 1,
      participants: people(4).map((p, i) => ({ ...p, groupIndex: i % 2 })),
    })
  }

  it('gera a chave quando os grupos terminam', () => {
    const c = grupos()
    for (const m of c.matches) finish(m, 'lado_a')
    expect(maybeGenerateBracketFromGroups(c)).toBe(true)
    const final = c.matches.find((m) => m.phase === 'eliminatoria')!
    expect([final.sideA, final.sideB].every(Boolean)).toBe(true)
  })

  it('jogo de grupo corrigido antes da chave começar refaz a chave', () => {
    const c = grupos()
    const g1 = c.matches.filter((m) => m.phase === 'grupos')
    for (const m of g1) finish(m, 'lado_a')
    maybeGenerateBracketFromGroups(c)
    const before = c.matches.find((m) => m.phase === 'eliminatoria')!
    const g1Winner = nameOf(c, g1[0].sideA)
    expect([nameOf(c, before.sideA), nameOf(c, before.sideB)]).toContain(g1Winner)

    finish(g1[0], 'lado_b') // corrige o vencedor do grupo A
    expect(maybeGenerateBracketFromGroups(c)).toBe(true)
    const after = c.matches.filter((m) => m.phase === 'eliminatoria')
    expect(after).toHaveLength(1)
    expect([nameOf(c, after[0].sideA), nameOf(c, after[0].sideB)]).toContain(nameOf(c, g1[0].sideB))
  })

  it('não mexe na chave depois que ela começou', () => {
    const c = grupos()
    const g = c.matches.filter((m) => m.phase === 'grupos')
    for (const m of g) finish(m, 'lado_a')
    maybeGenerateBracketFromGroups(c)
    const final = c.matches.find((m) => m.phase === 'eliminatoria')!
    final.games = [{ game_number: 1, score_a: 3, score_b: 1 }]
    finish(g[0], 'lado_b')
    expect(maybeGenerateBracketFromGroups(c)).toBe(false)
    expect(c.matches.find((m) => m.phase === 'eliminatoria')).toBe(final)
  })
})
