'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

// Criação por RPC transacional (create_championship): tudo numa transação no
// banco — o app iOS chama a mesma função. As actions só montam o JSON.

type StageInput = {
  counting: 'set' | 'tempo'
  rounds?: number
  setsToPlay: number
  pointsPerSet: number
  winByTwo: boolean
  setDrawEnabled: boolean
  timeMinutes: number | null
}

function stageJson(s: StageInput) {
  return {
    counting: s.counting,
    rounds: s.rounds ?? 1,
    sets_to_play: s.setsToPlay,
    points_per_set: s.pointsPerSet,
    win_by_two: s.winByTwo,
    set_draw_enabled: s.setDrawEnabled,
    time_minutes: s.timeMinutes,
  }
}

function commonFields(cfg: {
  name: string
  startDate?: string | null
  endDate?: string | null
  isOfficial?: boolean
  description?: string | null
  venueId?: string | null
}) {
  return {
    name: cfg.name.trim(),
    start_date: cfg.startDate ?? null,
    end_date: cfg.endDate ?? null,
    is_official: cfg.isOfficial ?? false,
    description: cfg.description ?? null,
    venue_id: cfg.venueId ?? null,
  }
}

async function createChampionshipRpc(
  c: Record<string, unknown>,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc('create_championship', { _c: c })
  if (error) return { error: error.message }
  if (!id) return { error: 'Campeonato não foi criado.' }
  return { id: id as string }
}

// ─── Liga ─────────────────────────────────────────────────────────────────────

export type LigaCfg = {
  name: string
  startDate?: string | null
  endDate?: string | null
  isOfficial?: boolean
  description?: string | null
  venueId?: string | null
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  allowDraw: boolean
  tiebreakers: string[]
  counting: 'set' | 'tempo'
  rounds: number
  setsToPlay: number
  pointsPerSet: number
  winByTwo: boolean
  setDrawEnabled: boolean
  timeMinutes: number | null
  playerIds: string[]
  /** Modo duplas: passa pairs em vez de playerIds */
  pairs?: { p1: string; p2: string }[]
  status: 'rascunho' | 'ativo'
}

export async function createLigaChampionship(
  cfg: LigaCfg,
): Promise<{ id: string } | { error: string }> {
  const isPair = !!cfg.pairs?.length
  return createChampionshipRpc({
    ...commonFields(cfg),
    format: 'liga',
    unit: isPair ? 'pair' : 'player',
    status: cfg.status,
    allow_draw: cfg.allowDraw,
    points_win: cfg.pointsWin,
    points_draw: cfg.allowDraw ? cfg.pointsDraw : 0,
    points_loss: cfg.pointsLoss,
    tiebreakers: cfg.tiebreakers,
    stage: stageJson({ ...cfg, rounds: cfg.rounds }),
    participants: isPair
      ? (cfg.pairs ?? []).map((pr) => ({ user_ids: [pr.p1, pr.p2] }))
      : cfg.playerIds.map((id) => ({ user_ids: [id] })),
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type EliminatoriaCfg = {
  name: string
  startDate?: string | null
  endDate?: string | null
  isOfficial?: boolean
  description?: string | null
  venueId?: string | null
  hasThirdPlace: boolean
  counting: 'set' | 'tempo'
  setsToPlay: 1 | 3 | 5
  pointsPerSet: number
  winByTwo: boolean
  setDrawEnabled: boolean
  timeMinutes: number | null
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  tiebreakers: string[]
  players: { userId: string; seed: number | null }[]
  /** Modo duplas: passa pairs em vez de players */
  pairs?: { p1: string; p2: string; seed?: number | null }[]
  status: 'rascunho' | 'ativo'
}

// ─── createEliminatoriaChampionship ──────────────────────────────────────────
// Eliminatória nunca tem empate nem pontuação de empate (#5) — o banco garante.

export async function createEliminatoriaChampionship(
  cfg: EliminatoriaCfg,
): Promise<{ id: string } | { error: string }> {
  const isPair = !!cfg.pairs?.length
  return createChampionshipRpc({
    ...commonFields(cfg),
    format: 'eliminatoria',
    unit: isPair ? 'pair' : 'player',
    status: cfg.status,
    allow_draw: false,
    has_third_place: cfg.hasThirdPlace,
    points_win: cfg.pointsWin,
    points_draw: 0,
    points_loss: cfg.pointsLoss,
    tiebreakers: cfg.tiebreakers,
    stage: stageJson({ ...cfg, rounds: 1, setDrawEnabled: false }),
    participants: isPair
      ? (cfg.pairs ?? []).map((pr) => ({ user_ids: [pr.p1, pr.p2], seed: pr.seed ?? null }))
      : cfg.players.map((pl) => ({ user_ids: [pl.userId], seed: pl.seed })),
  })
}

// ─── createGruposElimChampionship ─────────────────────────────────────────────

export type GruposElimCfg = {
  name: string
  startDate?: string | null
  endDate?: string | null
  isOfficial?: boolean
  description?: string | null
  venueId?: string | null
  numGroups: number
  qualifiersPerGroup: number
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  allowDraw: boolean
  tiebreakers: string[]
  // Fase de grupos
  groupsCounting: 'set' | 'tempo'
  groupsRounds: number
  groupsSetsToPlay: 1 | 3 | 5
  groupsPointsPerSet: number
  groupsWinByTwo: boolean
  groupsSetDrawEnabled: boolean
  groupsTimeMinutes: number | null
  // Fase eliminatória
  elimCounting: 'set' | 'tempo'
  elimSetsToPlay: 1 | 3 | 5
  elimPointsPerSet: number
  elimWinByTwo: boolean
  elimSetDrawEnabled: boolean
  elimTimeMinutes: number | null
  hasThirdPlace: boolean
  // Jogadores na ordem de envio (índice determina grupo via snake draft no SQL)
  players: { userId: string; seed: number | null }[]
  /** Modo duplas: cada par carrega o groupIndex calculado no wizard */
  pairs?: { p1: string; p2: string; seed?: number | null; groupIndex: number }[]
  status: 'rascunho' | 'ativo'
}

export async function createGruposElimChampionship(
  cfg: GruposElimCfg,
): Promise<{ id: string } | { error: string }> {
  // Oficial: grupos vazios, jogadores sem grupo e rascunho (alocação no início).
  // Jogadores sem groupIndex: zigue-zague no banco, na ordem enviada (o wizard
  // já ordena para refletir a alocação manual). Duplas: groupIndex do wizard.
  const isPair = !cfg.isOfficial && !!cfg.pairs?.length
  return createChampionshipRpc({
    ...commonFields(cfg),
    format: 'grupos_elim',
    unit: isPair ? 'pair' : 'player',
    status: cfg.status,
    num_groups: cfg.numGroups,
    allow_draw: cfg.allowDraw,
    has_third_place: cfg.hasThirdPlace,
    points_win: cfg.pointsWin,
    points_draw: cfg.allowDraw ? cfg.pointsDraw : 0,
    points_loss: cfg.pointsLoss,
    tiebreakers: cfg.tiebreakers,
    groups_stage: stageJson({
      counting: cfg.groupsCounting,
      rounds: cfg.groupsRounds,
      setsToPlay: cfg.groupsSetsToPlay,
      pointsPerSet: cfg.groupsPointsPerSet,
      winByTwo: cfg.groupsWinByTwo,
      setDrawEnabled: cfg.groupsSetDrawEnabled,
      timeMinutes: cfg.groupsTimeMinutes,
    }),
    elim_stage: stageJson({
      counting: cfg.elimCounting,
      setsToPlay: cfg.elimSetsToPlay,
      pointsPerSet: cfg.elimPointsPerSet,
      winByTwo: cfg.elimWinByTwo,
      setDrawEnabled: false,
      timeMinutes: cfg.elimTimeMinutes,
    }),
    participants: isPair
      ? (cfg.pairs ?? []).map((pr) => ({ user_ids: [pr.p1, pr.p2], seed: pr.seed ?? null, group_index: pr.groupIndex }))
      : cfg.players.map((pl) => ({ user_ids: [pl.userId], seed: pl.seed })),
  })
}

// ════════════════════════════════════════════════════════════════════════════
// Campeonatos Oficiais — inscrição, gestão e início
// ════════════════════════════════════════════════════════════════════════════

// ─── Jogador solicita inscrição (cria participante pendente) ─────────────────
export async function requestEnrollment(
  championshipId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('request_enrollment', {
    _championship_id: championshipId,
  })
  if (error) return { error: error.message }
  revalidatePath(`/campeonatos/${championshipId}`)
  return { ok: true }
}

// ─── Organizador aprova inscrição pendente ──────────────────────────────────
export async function approveEnrollment(
  participantId: string,
  championshipId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('participants')
    .update({ enrollment_status: 'confirmado' })
    .eq('id', participantId)
  if (error) return { error: error.message }
  revalidatePath(`/campeonatos/${championshipId}`)
  return { ok: true }
}

// ─── Organizador recusa/remove inscrição ────────────────────────────────────
export async function rejectEnrollment(
  participantId: string,
  championshipId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('participants').delete().eq('id', participantId)
  if (error) return { error: error.message }
  revalidatePath(`/campeonatos/${championshipId}`)
  return { ok: true }
}

// ─── Organizador adiciona jogador diretamente (confirmado) ──────────────────
export async function addPlayerToChampionship(
  championshipId: string,
  userId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  // RPC add_participant: confere permissão e duplicidade numa transação.
  const { error } = await supabase.rpc('add_participant', {
    _championship_id: championshipId,
    _user_id: userId,
  })
  if (error) return { error: error.message }
  revalidatePath(`/campeonatos/${championshipId}`)
  return { ok: true }
}

// ─── Organizador inicia o campeonato oficial ────────────────────────────────
// Para grupos_elim: distribui os confirmados nos grupos (snake draft) antes de
// ativar. Depois muda status→ativo (o trigger gera as partidas).
export async function startOfficialChampionship(
  championshipId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('start_official_championship', {
    _championship_id: championshipId,
  })
  if (error) return { error: error.message }
  revalidatePath(`/campeonatos/${championshipId}`)
  return { ok: true }
}

// ─── Edição de campeonato oficial (até o início; status='rascunho') ─────────
export type OfficialStageEdit = {
  id: string
  counting: 'set' | 'tempo'
  rounds: number
  setsToPlay: number
  pointsPerSet: number
  winByTwo: boolean
  setDrawEnabled: boolean
  timeMinutes: number | null
}

export type OfficialEditPayload = {
  name: string
  description: string | null
  venueId: string | null
  startDate: string | null
  endDate: string | null
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  allowDraw: boolean
  hasThirdPlace: boolean
  stages: OfficialStageEdit[]
  /** grupos_elim: nº de grupos (recria os grupos vazios se mudar) */
  numGroups?: number
}

export async function updateOfficialChampionship(
  id: string,
  p: OfficialEditPayload,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_official_championship', {
    _id: id,
    _p: {
      name: p.name.trim(),
      description: p.description,
      venue_id: p.venueId,
      start_date: p.startDate,
      end_date: p.endDate,
      points_win: p.pointsWin,
      points_draw: p.allowDraw ? p.pointsDraw : 0,
      points_loss: p.pointsLoss,
      allow_draw: p.allowDraw,
      has_third_place: p.hasThirdPlace,
      stages: p.stages.map((s) => ({ id: s.id, ...stageJson(s) })),
      num_groups: p.numGroups ?? null,
    },
  })
  if (error) return { error: error.message }
  revalidatePath(`/campeonatos/${id}`)
  return { ok: true }
}
