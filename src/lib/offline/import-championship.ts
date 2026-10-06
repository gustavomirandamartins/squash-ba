// Importação de campeonato criado OFFLINE (Fase 2).
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

/** IDs locais são `lp-<uuid>`, `lm-<uuid>`, `lg-<uuid>`, `local-<uuid>` → o UUID. */
export function toUuid(localId: string | null | undefined): string | null {
  if (!localId) return null
  const raw = localId.replace(/^(?:lp|lm|lg|local)-/, '')
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
  format: 'liga' | 'eliminatoria' | 'grupos_elim'
  unit: 'player' | 'pair'
  start_date: string | null
  end_date: string | null
  description: string | null
  venue_id: string | null
  allow_draw: boolean
  has_third_place: boolean
  points_win: number
  points_draw: number
  points_loss: number
  tiebreakers: string[]
  stages: StageRow[]
  groups: { id: string; stage_id: string; name: string; ordering: number }[]
  participants: { id: string; kind: 'player' | 'pair'; seed: number | null; group_id: string | null; user_ids: string[] }[]
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
 * (oficial, desafio, ou ID local fora do formato UUID) — aí vale o caminho
 * antigo (criar no servidor + casar placares).
 */
export function buildImportPayload(
  tempId: string,
  op: CreationOp,
  local: LocalChampionship,
): ImportPayload | null {
  const id = toUuid(tempId)
  if (!id) return null
  if (op.type !== 'champ_liga' && op.type !== 'champ_elim' && op.type !== 'champ_grupos') return null
  if (op.cfg.isOfficial) return null

  let stages: StageRow[]
  let common: Pick<ImportPayload, 'format' | 'allow_draw' | 'has_third_place' | 'points_draw'>
  // fase de cada jogo
  let stageFor: (m: LocalMatch) => StageRow

  if (op.type === 'champ_liga') {
    const c = op.cfg
    const st: StageRow = {
      id: newUuid(), name: 'Liga', ordering: 1, kind: 'liga', counting: c.counting, rounds: c.rounds,
      sets_to_play: c.setsToPlay, points_per_set: c.pointsPerSet, win_by_two: c.winByTwo,
      set_draw_enabled: c.setDrawEnabled, time_minutes: c.timeMinutes,
    }
    stages = [st]
    stageFor = () => st
    common = { format: 'liga', allow_draw: c.allowDraw, has_third_place: false, points_draw: c.allowDraw ? c.pointsDraw : 0 }
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
    common = { format: 'eliminatoria', allow_draw: false, has_third_place: c.hasThirdPlace, points_draw: 0 }
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
    common = { format: 'grupos_elim', allow_draw: c.allowDraw, has_third_place: c.hasThirdPlace, points_draw: c.allowDraw ? c.pointsDraw : 0 }
  }

  // IDs locais → UUIDs (todos têm de converter, senão não dá para importar).
  const ids = new Map<string, string>()
  const all = [
    ...local.participants.map((p) => p.id),
    ...local.matches.map((m) => m.id),
    ...(local.groups ?? []).map((g) => g.id),
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

  const c = op.cfg
  return {
    id,
    name: c.name.trim(),
    unit: local.unit,
    start_date: c.startDate || null,
    end_date: c.endDate || null,
    description: c.description || null,
    venue_id: c.venueId || null,
    points_win: c.pointsWin,
    points_loss: c.pointsLoss,
    tiebreakers: c.tiebreakers,
    ...common,
    stages,
    groups,
    participants: local.participants.map((p) => ({
      id: map(p.id)!,
      kind: local.unit,
      seed: p.seed,
      group_id: map(p.groupId),
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
