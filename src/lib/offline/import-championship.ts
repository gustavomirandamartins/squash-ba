// Importação de campeonato ou desafio criado OFFLINE (Fases 2 e 3).
//
// Em vez de criar o campeonato no servidor (que gera os próprios jogos) e depois
// tentar casar os placares por heurística, envia o campeonato provisório inteiro
// — mesmos IDs, mesmos jogos, mesma chave, placares — para a RPC
// `import_championship`, que grava tudo numa transação. O ID do campeonato é o
// do aparelho, então reenviar (resposta perdida, app fechado no meio) devolve o
// mesmo campeonato em vez de duplicar.

import { createClient } from '@/utils/supabase/client'
import { isNetworkError } from '@/lib/score-engine/SyncEngine'
import type { LocalChampionship, LocalMatch } from './local-championship'
import type { CreationOp } from './types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** IDs locais são `lp-`, `lm-`, `lg-`, `lt-`, `local-<uuid>` → o UUID. */
export function toUuid(localId: string | null | undefined): string | null {
  if (!localId) return null
  const raw = localId.replace(/^(?:lp|lm|lg|lt|local)-/, '')
  return UUID.test(raw) ? raw.toLowerCase() : null
}

function newUuid(): string {
  return crypto.randomUUID()
}

type StageRow = {
  id: string
  name: string
  ordering: number
  kind: 'liga' | 'eliminatoria' | 'grupos'
  counting: string
  rounds: number
  sets_to_play: number
  points_per_set: number
  win_by_two: boolean
  set_draw_enabled: boolean
  time_minutes: number | null
}

export type ImportPayload = {
  id: string
  name: string
  format: 'liga' | 'eliminatoria' | 'grupos_elim' | 'desafio'
  unit: 'player' | 'pair' | 'team'
  start_date: string | null
  end_date: string | null
  description: string | null
  venue_id: string | null
  allow_draw: boolean
  has_third_place: boolean
  has_final: boolean
  points_win: number
  points_draw: number
  points_loss: number
  tiebreakers: string[]
  stages: StageRow[]
  groups: { id: string; stage_id: string; name: string; ordering: number }[]
  /** desafio por times: os dois lados */
  teams: { id: string; name: string; team_id: string | null; ordering: number }[]
  participants: {
    id: string
    kind: 'player' | 'pair'
    seed: number | null
    group_id: string | null
    team_id: string | null
    user_ids: string[]
  }[]
  matches: {
    id: string
    stage_id: string
    group_id: string | null
    round: number
    bracket_slot: number | null
    side_a: string | null
    side_b: string | null
    status: string
    result: string | null
    winner_advances_to: string | null
    duration_seconds: number | null
    games: { game_number: number; score_a: number; score_b: number }[]
  }[]
}

/**
 * Monta o payload. Retorna null quando o campeonato não pode ser importado
 * (oficial, desafio 1v1 — que depende do aceite do convite —, ou ID local fora
 * do formato UUID) — aí vale o caminho antigo (criar no servidor + casar placares).
 */
export function buildImportPayload(
  tempId: string,
  op: CreationOp,
  local: LocalChampionship,
): ImportPayload | null {
  const id = toUuid(tempId)
  if (!id) return null

  let stages: StageRow[]
  // fase de cada jogo
  let stageFor: (m: LocalMatch) => StageRow
  let head: Omit<ImportPayload, 'id' | 'unit' | 'stages' | 'groups' | 'teams' | 'participants' | 'matches'>

  if (op.type === 'champ_liga' || op.type === 'champ_elim' || op.type === 'champ_grupos') {
    if (op.cfg.isOfficial) return null
    const c0 = op.cfg
    const base = {
      name: c0.name.trim(),
      start_date: c0.startDate || null,
      end_date: c0.endDate || null,
      description: c0.description || null,
      venue_id: c0.venueId || null,
      points_win: c0.pointsWin,
      points_loss: c0.pointsLoss,
      tiebreakers: c0.tiebreakers,
      has_final: false,
    }

    if (op.type === 'champ_liga') {
      const c = op.cfg
      const st: StageRow = {
        id: newUuid(), name: 'Liga', ordering: 1, kind: 'liga', counting: c.counting, rounds: c.rounds,
        sets_to_play: c.setsToPlay, points_per_set: c.pointsPerSet, win_by_two: c.winByTwo,
        set_draw_enabled: c.setDrawEnabled, time_minutes: c.timeMinutes,
      }
      stages = [st]
      stageFor = () => st
      head = { ...base, format: 'liga', allow_draw: c.allowDraw, has_third_place: false, points_draw: c.allowDraw ? c.pointsDraw : 0 }
    } else if (op.type === 'champ_elim') {
      const c = op.cfg
      // Eliminatória nunca tem empate (igual à criação online).
      const st: StageRow = {
        id: newUuid(), name: 'Eliminatória', ordering: 1, kind: 'eliminatoria', counting: c.counting, rounds: 1,
        sets_to_play: c.setsToPlay, points_per_set: c.pointsPerSet, win_by_two: c.winByTwo,
        set_draw_enabled: false, time_minutes: c.timeMinutes,
      }
      stages = [st]
      stageFor = () => st
      head = { ...base, format: 'eliminatoria', allow_draw: false, has_third_place: c.hasThirdPlace, points_draw: 0 }
    } else {
      const c = op.cfg
      const groupsStage: StageRow = {
        id: newUuid(), name: 'Grupos', ordering: 1, kind: 'grupos', counting: c.groupsCounting, rounds: c.groupsRounds,
        sets_to_play: c.groupsSetsToPlay, points_per_set: c.groupsPointsPerSet, win_by_two: c.groupsWinByTwo,
        set_draw_enabled: c.groupsSetDrawEnabled, time_minutes: c.groupsTimeMinutes,
      }
      const elimStage: StageRow = {
        id: newUuid(), name: 'Eliminatórias', ordering: 2, kind: 'eliminatoria', counting: c.elimCounting, rounds: 1,
        sets_to_play: c.elimSetsToPlay, points_per_set: c.elimPointsPerSet, win_by_two: c.elimWinByTwo,
        set_draw_enabled: false, time_minutes: c.elimTimeMinutes,
      }
      stages = [groupsStage, elimStage]
      stageFor = (m) => (m.phase === 'eliminatoria' ? elimStage : groupsStage)
      head = { ...base, format: 'grupos_elim', allow_draw: c.allowDraw, has_third_place: c.hasThirdPlace, points_draw: c.allowDraw ? c.pointsDraw : 0 }
    }
  } else if (op.type === 'desafio_duplas' || op.type === 'desafio_times') {
    if (local.format !== 'desafio') return null
    const c = op.cfg
    // Igual a createDesafioDuplas/createDesafioTimes: fase única tipo liga.
    const allowDraw = c.counting === 'tempo' || c.setDrawEnabled
    const st: StageRow = {
      id: newUuid(), name: 'Fase única', ordering: 1, kind: 'liga', counting: c.counting, rounds: c.rounds,
      sets_to_play: c.setsToPlay, points_per_set: c.pointsPerSet, win_by_two: c.winByTwo,
      set_draw_enabled: c.setDrawEnabled, time_minutes: c.timeMinutes,
    }
    stages = [st]
    stageFor = () => st
    head = {
      name: c.name.trim(),
      format: 'desafio',
      start_date: null,
      end_date: null,
      description: null,
      venue_id: c.venueId || null,
      allow_draw: allowDraw,
      has_third_place: false,
      has_final: op.type === 'desafio_times' ? op.hasFinal : false,
      points_win: c.pointsWin,
      points_draw: allowDraw ? c.pointsDraw : 0,
      points_loss: c.pointsLoss,
      tiebreakers: c.tiebreakers,
    }
  } else {
    return null
  }

  // IDs locais → UUIDs (todos têm de converter, senão não dá para importar).
  const ids = new Map<string, string>()
  const all = [
    ...local.participants.map((p) => p.id),
    ...local.matches.map((m) => m.id),
    ...(local.groups ?? []).map((g) => g.id),
    ...(local.teams ?? []).map((t) => t.id),
  ]
  for (const lid of all) {
    const u = toUuid(lid)
    if (!u) return null
    ids.set(lid, u)
  }
  const map = (lid: string | null | undefined) => (lid ? ids.get(lid) ?? null : null)

  const groupsStageId = stages.find((s) => s.kind === 'grupos')?.id
  const groups = (local.groups ?? []).map((g, i) => ({
    id: map(g.id)!,
    stage_id: groupsStageId!,
    name: g.name,
    ordering: i + 1,
  }))

  // Desafio por times: ordering 0/1 (igual a createDesafioTimes).
  const teams = (local.teams ?? []).map((t, i) => ({
    id: map(t.id)!,
    name: t.name,
    team_id: t.teamId || null,
    ordering: i,
  }))
  const teamOf = new Map<string, string>()
  for (const t of local.teams ?? []) for (const pid of t.participantIds) teamOf.set(pid, map(t.id)!)

  // Times: cada participante é um jogador.
  const kind: 'player' | 'pair' = local.unit === 'pair' ? 'pair' : 'player'

  return {
    id,
    unit: local.unit,
    ...head,
    stages,
    groups,
    teams,
    participants: local.participants.map((p) => ({
      id: map(p.id)!,
      kind,
      seed: p.seed,
      group_id: map(p.groupId),
      team_id: teamOf.get(p.id) ?? null,
      user_ids: p.userIds,
    })),
    matches: local.matches.map((m) => {
      const st = stageFor(m)
      return {
        id: map(m.id)!,
        stage_id: st.id,
        group_id: map(m.groupId),
        round: m.round,
        bracket_slot: m.bracketSlot ?? null,
        side_a: map(m.sideA),
        side_b: map(m.sideB),
        status: m.status,
        result: m.result,
        winner_advances_to: map(m.winnerAdvancesTo),
        // Jogo por tempo encerrado: o servidor só finaliza com a duração
        // preenchida (o provisório não tem cronômetro → 0).
        duration_seconds: st.counting === 'tempo' && m.status === 'finalizado' ? 0 : null,
        games: m.games.map((g) => ({ game_number: g.game_number, score_a: g.score_a, score_b: g.score_b })),
      }
    }),
  }
}

export type ImportOutcome =
  | { kind: 'ok'; id: string }
  /** banco sem a RPC (migração não aplicada) ou campeonato não importável */
  | { kind: 'unsupported' }
  /** sem rede: seguro tentar de novo (idempotente) */
  | { kind: 'retry' }
  | { kind: 'error'; error: string }

export async function importLocalChampionship(
  tempId: string,
  op: CreationOp,
  local: LocalChampionship,
): Promise<ImportOutcome> {
  const payload = buildImportPayload(tempId, op, local)
  if (!payload) return { kind: 'unsupported' }
  try {
    const supabase = createClient()
    await supabase.auth.getSession() // renova o token se venceu offline
    const { data, error } = await supabase.rpc('import_championship', { _c: payload })
    if (error) {
      if (error.code === 'PGRST202' || /could not find the function/i.test(error.message)) {
        return { kind: 'unsupported' }
      }
      if (isNetworkError(error) || /jwt/i.test(error.message)) return { kind: 'retry' }
      return { kind: 'error', error: error.message }
    }
    return { kind: 'ok', id: (data as string) ?? payload.id }
  } catch (err) {
    if (isNetworkError(err)) return { kind: 'retry' }
    return { kind: 'error', error: err instanceof Error ? err.message : 'Falha ao enviar o campeonato.' }
  }
}
