import { describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/supabase/client', () => ({ createClient: () => ({}) }))

import { buildImportPayload, toUuid } from './import-championship'
import { buildLocalEliminatoria, buildLocalGrupos, buildLocalLiga } from './local-championship'
import type { CreationOp } from './types'
import type { StageCfg } from '@/lib/standings/compute'

const stage: StageCfg = { counting: 'set', points_per_set: 11, win_by_two: true, set_draw_enabled: false, sets_to_play: 1 }
const champ = { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, tiebreakers: ['sets_ganhos'] }
const uid = () => crypto.randomUUID()
const people = (n: number) => Array.from({ length: n }, () => ({ userIds: [uid()], name: 'X', avatarUrl: null, seed: null }))
const TEMP = `local-${uid()}`

const baseCfg = {
  name: '  Copa  ', startDate: '2026-10-06', endDate: null, isOfficial: false, description: null, venueId: null,
  pointsWin: 3, pointsDraw: 1, pointsLoss: 0, tiebreakers: ['sets_ganhos'], status: 'ativo' as const,
}

describe('toUuid', () => {
  it('tira o prefixo local', () => {
    const u = uid()
    expect(toUuid(`lm-${u}`)).toBe(u)
    expect(toUuid(`local-${u}`)).toBe(u)
    expect(toUuid('lm-123abc')).toBeNull()
  })
})

describe('buildImportPayload', () => {
  it('liga por tempo: IDs do aparelho, uma fase, duração só nos encerrados', () => {
    const local = buildLocalLiga(TEMP, {
      name: 'Copa', startDate: null, unit: 'player', rounds: 1, champ,
      stage: { ...stage, counting: 'tempo' }, participants: people(3),
    })
    local.matches[0].games = [{ game_number: 1, score_a: 5, score_b: 2 }]
    local.matches[0].status = 'finalizado'
    local.matches[0].result = 'lado_a'
    const op = {
      type: 'champ_liga',
      cfg: { ...baseCfg, allowDraw: false, counting: 'tempo', rounds: 1, setsToPlay: 1, pointsPerSet: 11, winByTwo: true, setDrawEnabled: false, timeMinutes: 15, playerIds: [] },
    } as CreationOp
    const p = buildImportPayload(TEMP, op, local)!
    expect(p.id).toBe(toUuid(TEMP))
    expect(p.name).toBe('Copa')
    expect(p.points_draw).toBe(0)
    expect(p.stages).toHaveLength(1)
    expect(p.participants.map((x) => x.id)).toEqual(local.participants.map((x) => toUuid(x.id)))
    expect(p.matches[0]).toMatchObject({ duration_seconds: 0, status: 'finalizado', games: [{ game_number: 1, score_a: 5, score_b: 2 }] })
    expect(p.matches[1].duration_seconds).toBeNull()
    expect(p.matches.every((m) => m.stage_id === p.stages[0].id)).toBe(true)
  })

  it('eliminatória: avanço da chave e byes preservados', () => {
    const local = buildLocalEliminatoria(TEMP, {
      name: 'Copa', startDate: null, unit: 'player', stage, champ, hasThirdPlace: false,
      participants: people(5),
    })
    const op = {
      type: 'champ_elim',
      cfg: { ...baseCfg, hasThirdPlace: false, counting: 'set', setsToPlay: 1, pointsPerSet: 11, winByTwo: true, setDrawEnabled: false, timeMinutes: null, players: [] },
    } as CreationOp
    const p = buildImportPayload(TEMP, op, local)!
    const ids = new Set(p.matches.map((m) => m.id))
    const advancing = p.matches.filter((m) => m.winner_advances_to)
    expect(advancing.length).toBeGreaterThan(0)
    expect(advancing.every((m) => ids.has(m.winner_advances_to!))).toBe(true)
    const byes = p.matches.filter((m) => m.status === 'finalizado' && m.games.length === 0)
    expect(byes).toHaveLength(3)
    expect(p.allow_draw).toBe(false)
  })

  it('grupos: jogos de grupo na fase de grupos, chave na eliminatória', () => {
    const local = buildLocalGrupos(TEMP, {
      name: 'Copa', startDate: null, unit: 'player', groupsStage: stage, elimStage: stage, champ,
      hasThirdPlace: false, numGroups: 2, rounds: 1,
      participants: people(4).map((x, i) => ({ ...x, groupIndex: i % 2 })),
    })
    const op = {
      type: 'champ_grupos',
      cfg: {
        ...baseCfg, numGroups: 2, qualifiersPerGroup: 1, allowDraw: false,
        groupsCounting: 'set', groupsRounds: 1, groupsSetsToPlay: 1, groupsPointsPerSet: 11, groupsWinByTwo: true, groupsSetDrawEnabled: false, groupsTimeMinutes: null,
        elimCounting: 'set', elimSetsToPlay: 1, elimPointsPerSet: 11, elimWinByTwo: true, elimSetDrawEnabled: false, elimTimeMinutes: null,
        hasThirdPlace: false, players: [],
      },
    } as CreationOp
    const p = buildImportPayload(TEMP, op, local)!
    const [gStage] = p.stages
    expect(p.groups).toHaveLength(2)
    expect(p.groups.every((g) => g.stage_id === gStage.id)).toBe(true)
    expect(p.participants.every((x) => p.groups.some((g) => g.id === x.group_id))).toBe(true)
    expect(p.matches.every((m) => m.stage_id === gStage.id && m.group_id)).toBe(true)
  })

  it('oficial ou desafio não são importados (caminho antigo)', () => {
    const local = buildLocalLiga(TEMP, { name: 'x', startDate: null, unit: 'player', rounds: 1, champ, stage, participants: people(2) })
    const official = { type: 'champ_liga', cfg: { ...baseCfg, isOfficial: true } } as unknown as CreationOp
    expect(buildImportPayload(TEMP, official, local)).toBeNull()
    expect(buildImportPayload('local-123', { type: 'champ_liga', cfg: baseCfg } as unknown as CreationOp, local)).toBeNull()
  })
})
