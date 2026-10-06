import { describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/supabase/client', () => ({ createClient: () => ({}) }))

import {
  buildLocalDesafioDuplas, buildLocalDesafioTimes, syncTeamFinal, isTeamFinal, type LocalChampionship,
} from './local-championship'
import { buildImportPayload, toUuid } from './import-championship'
import type { CreationOp } from './types'
import type { StageCfg } from '@/lib/standings/compute'

const stage: StageCfg = { counting: 'set', points_per_set: 11, win_by_two: true, set_draw_enabled: false, sets_to_play: 1 }
const champ = { pointsWin: 3, pointsDraw: 0, pointsLoss: 0, tiebreakers: ['sets_ganhos'] }
const uid = () => crypto.randomUUID()
const TEMP = `local-${uid()}`
const player = () => ({ userIds: [uid()], name: 'X', avatarUrl: null })
const cfg = {
  name: ' Desafio ', rounds: 1, counting: 'set' as const, setsToPlay: 1 as const, pointsPerSet: 11, winByTwo: true,
  setDrawEnabled: false, timeMinutes: null, pointsWin: 3, pointsDraw: 1, pointsLoss: 0, tiebreakers: ['sets_ganhos'], venueId: null,
}

function times(n: number, hasFinal = true): LocalChampionship {
  return buildLocalDesafioTimes(TEMP, {
    name: 'D', stage, rounds: 1, champ, hasFinal,
    teams: [
      { teamId: uid(), name: 'A', players: Array.from({ length: n }, player) },
      { teamId: uid(), name: 'B', players: Array.from({ length: n }, player) },
    ],
  })
}

function play(c: LocalChampionship, scores: [number, number][]) {
  c.matches.filter((m) => !isTeamFinal(m)).forEach((m, i) => {
    const [a, b] = scores[i]
    m.games = [{ game_number: 1, score_a: a, score_b: b }]
    m.status = 'finalizado'
    m.result = a > b ? 'lado_a' : 'lado_b'
  })
}

describe('desafio de duplas', () => {
  it('2 duplas, um jogo por rodada', () => {
    const c = buildLocalDesafioDuplas(TEMP, { name: 'D', stage, rounds: 3, champ, pairs: [player(), player()] })
    expect(c.format).toBe('desafio')
    expect(c.unit).toBe('pair')
    expect(c.matches.map((m) => m.round)).toEqual([1, 2, 3])
  })
})

describe('desafio por times', () => {
  it('cada jogador de A enfrenta cada jogador de B', () => {
    const c = times(2)
    expect(c.matches).toHaveLength(4)
    const [a, b] = c.teams!
    expect(c.matches.every((m) => a.participantIds.includes(m.sideA!) && b.participantIds.includes(m.sideB!))).toBe(true)
  })

  it('final só quando todos os jogos terminam, com o melhor de cada time', () => {
    const c = times(2)
    expect(syncTeamFinal(c)).toBe(false)
    // A1 vence os dois por muito; B2 é o melhor de B (sets ganhos)
    play(c, [[11, 1], [11, 2], [3, 11], [9, 11]])
    expect(syncTeamFinal(c)).toBe(true)
    const final = c.matches.find(isTeamFinal)!
    const [a, b] = c.teams!
    expect(final.sideA).toBe(a.participantIds[0])
    expect(final.sideB).toBe(b.participantIds[1])
    expect(final).toMatchObject({ round: 999, bracketSlot: -1, status: 'agendado' })
    // idempotente
    expect(syncTeamFinal(c)).toBe(false)
  })

  it('jogo reaberto antes da final começar retira a final', () => {
    const c = times(1)
    play(c, [[11, 4]])
    syncTeamFinal(c)
    c.matches[0].status = 'em_andamento'
    expect(syncTeamFinal(c)).toBe(true)
    expect(c.matches.some(isTeamFinal)).toBe(false)
  })

  it('final já começada não é mexida', () => {
    const c = times(1)
    play(c, [[11, 4]])
    syncTeamFinal(c)
    c.matches.find(isTeamFinal)!.games = [{ game_number: 1, score_a: 3, score_b: 1 }]
    c.matches[0].status = 'em_andamento'
    expect(syncTeamFinal(c)).toBe(false)
    expect(c.matches.some(isTeamFinal)).toBe(true)
  })

  it('sem final configurada não gera', () => {
    const c = times(1, false)
    play(c, [[11, 4]])
    expect(syncTeamFinal(c)).toBe(false)
  })
})

describe('importação de desafio', () => {
  it('duplas: fase única, participantes dupla', () => {
    const local = buildLocalDesafioDuplas(TEMP, { name: 'D', stage, rounds: 2, champ, pairs: [player(), player()] })
    const op = { type: 'desafio_duplas', cfg, partnerId: uid(), opponentIds: [uid(), uid()] } as CreationOp
    const p = buildImportPayload(TEMP, op, local)!
    expect(p).toMatchObject({ format: 'desafio', unit: 'pair', name: 'Desafio', allow_draw: false, points_draw: 0, has_final: false })
    expect(p.stages).toEqual([expect.objectContaining({ name: 'Fase única', kind: 'liga', rounds: 1 })])
    expect(p.participants.every((x) => x.kind === 'pair' && x.team_id === null)).toBe(true)
    expect(p.teams).toEqual([])
  })

  it('times: 2 times, jogadores ligados ao time, final junto', () => {
    const local = times(2)
    play(local, [[11, 1], [11, 2], [3, 11], [9, 11]])
    syncTeamFinal(local)
    const op = {
      type: 'desafio_times', cfg, hasFinal: true,
      teamA: { teamId: local.teams![0].teamId, name: 'A', playerIds: [] },
      teamB: { teamId: local.teams![1].teamId, name: 'B', playerIds: [] },
    } as CreationOp
    const p = buildImportPayload(TEMP, op, local)!
    expect(p).toMatchObject({ format: 'desafio', unit: 'team', has_final: true })
    expect(p.teams.map((t) => [t.ordering, t.team_id])).toEqual([[0, local.teams![0].teamId], [1, local.teams![1].teamId]])
    expect(p.participants.every((x) => x.kind === 'player' && p.teams.some((t) => t.id === x.team_id))).toBe(true)
    const final = p.matches.find((m) => m.bracket_slot === -1)!
    expect(final.round).toBe(999)
    expect(p.matches.map((m) => m.id)).toEqual(local.matches.map((m) => toUuid(m.id)))
  })

  it('1v1 não é importado (depende do aceite)', () => {
    const local = buildLocalDesafioDuplas(TEMP, { name: 'D', stage, rounds: 1, champ, pairs: [player(), player()] })
    const op = { type: 'desafio_1v1', cfg, opponentId: uid() } as CreationOp
    expect(buildImportPayload(TEMP, op, local)).toBeNull()
  })
})
