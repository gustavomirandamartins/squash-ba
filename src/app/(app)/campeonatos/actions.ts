'use server'

import { createClient } from '@/utils/supabase/server'

// ─── Liga (wrap do RPC create_liga_championship como server action) ───────────

export type LigaCfg = {
  name: string
  startDate?: string | null
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
  status: 'rascunho' | 'ativo'
}

export async function createLigaChampionship(
  cfg: LigaCfg,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc('create_liga_championship', {
    _name: cfg.name.trim(),
    _points_win: cfg.pointsWin,
    _points_draw: cfg.allowDraw ? cfg.pointsDraw : 0,
    _points_loss: cfg.pointsLoss,
    _allow_draw: cfg.allowDraw,
    _tiebreakers: cfg.tiebreakers,
    _stage_counting: cfg.counting,
    _rounds: cfg.rounds,
    _sets_to_play: cfg.setsToPlay,
    _points_per_set: cfg.pointsPerSet,
    _win_by_two: cfg.winByTwo,
    _set_draw_enabled: cfg.setDrawEnabled,
    _time_minutes: cfg.timeMinutes,
    _player_ids: cfg.playerIds,
    _status: cfg.status,
  })
  if (error) return { error: error.message }
  if (!id) return { error: 'Campeonato não foi criado.' }
  // Data de início (RPC não recebe; grava em seguida se informada)
  if (cfg.startDate) {
    await supabase.from('championships').update({ start_date: cfg.startDate }).eq('id', id as string)
  }
  return { id: id as string }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type EliminatoriaCfg = {
  name: string
  startDate?: string | null
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
  status: 'rascunho' | 'ativo'
}

// ─── createEliminatoriaChampionship ──────────────────────────────────────────
// Cria campeonato formato eliminatória seguindo o mesmo padrão de
// create_liga_championship: insere em rascunho → adiciona participantes com
// seeds → ativa (trigger gera o bracket).

export async function createEliminatoriaChampionship(
  cfg: EliminatoriaCfg,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Usuário não autenticado.' }

  // #5 — Eliminatória nunca tem empate nem pontuação de tabela:
  // quem vence avança, quem perde é eliminado. Forçamos sem-empate.
  const allowDraw = false

  // 1. Cria campeonato como rascunho (RLS: championships_insert ok pois created_by = auth.uid())
  const { data: champ, error: champErr } = await supabase
    .from('championships')
    .insert({
      name: cfg.name.trim(),
      format: 'eliminatoria',
      unit: 'player',
      status: 'rascunho',
      start_date: cfg.startDate ?? null,
      allow_draw: allowDraw,
      has_third_place: cfg.hasThirdPlace,
      points_win: cfg.pointsWin,
      points_draw: 0,
      points_loss: cfg.pointsLoss,
      tiebreakers: cfg.tiebreakers,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (champErr || !champ) return { error: champErr?.message ?? 'Erro ao criar campeonato.' }
  const champId = champ.id

  // 2. Fase (can_manage = true porque criador). set_draw_enabled sempre false (#5).
  const { error: stageErr } = await supabase.from('championship_stages').insert({
    championship_id: champId,
    name: 'Eliminatória',
    ordering: 1,
    kind: 'eliminatoria',
    counting: cfg.counting,
    rounds: 1,
    sets_to_play: cfg.setsToPlay,
    points_per_set: cfg.pointsPerSet,
    win_by_two: cfg.winByTwo,
    set_draw_enabled: false,
    time_minutes: cfg.timeMinutes,
  })

  if (stageErr) {
    await supabase.from('championships').delete().eq('id', champId)
    return { error: stageErr.message }
  }

  // 3. Participantes com seeds (trg_participants_guard: status='rascunho' → ok)
  for (const player of cfg.players) {
    const { data: part, error: partErr } = await supabase
      .from('participants')
      .insert({
        championship_id: champId,
        kind: 'player',
        enrollment_source: 'organizador',
        enrollment_status: 'confirmado',
        seed: player.seed ?? null,
      })
      .select('id')
      .single()

    if (partErr || !part) {
      await supabase.from('championships').delete().eq('id', champId)
      return { error: partErr?.message ?? 'Erro ao criar participante.' }
    }

    const { error: memberErr } = await supabase
      .from('participant_members')
      .insert({ participant_id: part.id, user_id: player.userId })

    if (memberErr) {
      await supabase.from('championships').delete().eq('id', champId)
      return { error: memberErr.message }
    }
  }

  // 4. Ativa se solicitado → trigger championship_status → generate_bracket_matches
  if (cfg.status === 'ativo') {
    const { error: activateErr } = await supabase
      .from('championships')
      .update({ status: 'ativo' })
      .eq('id', champId)

    if (activateErr) {
      // Não cancela: campeonato rascunho existe, usuário pode ativar depois
      return { error: activateErr.message }
    }
  }

  return { id: champId }
}

// ─── createGruposElimChampionship ─────────────────────────────────────────────
// Delega para o RPC create_grupos_elim_championship (security definer).

export type GruposElimCfg = {
  name: string
  startDate?: string | null
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
  status: 'rascunho' | 'ativo'
}

export async function createGruposElimChampionship(
  cfg: GruposElimCfg,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Usuário não autenticado.' }

  const { data: id, error: rpcError } = await supabase.rpc(
    'create_grupos_elim_championship',
    {
      _name: cfg.name.trim(),
      _num_groups: cfg.numGroups,
      _qualifiers_per_group: cfg.qualifiersPerGroup,
      _points_win: cfg.pointsWin,
      _points_draw: cfg.allowDraw ? cfg.pointsDraw : 0,
      _points_loss: cfg.pointsLoss,
      _allow_draw: cfg.allowDraw,
      _tiebreakers: cfg.tiebreakers,
      _groups_counting: cfg.groupsCounting,
      _groups_rounds: cfg.groupsRounds,
      _groups_sets_to_play: cfg.groupsSetsToPlay,
      _groups_points_per_set: cfg.groupsPointsPerSet,
      _groups_win_by_two: cfg.groupsWinByTwo,
      _groups_set_draw_enabled: cfg.groupsSetDrawEnabled,
      _groups_time_minutes: cfg.groupsTimeMinutes,
      _elim_counting: cfg.elimCounting,
      _elim_sets_to_play: cfg.elimSetsToPlay,
      _elim_points_per_set: cfg.elimPointsPerSet,
      _elim_win_by_two: cfg.elimWinByTwo,
      _elim_set_draw_enabled: cfg.elimSetDrawEnabled,
      _elim_time_minutes: cfg.elimTimeMinutes,
      _has_third_place: cfg.hasThirdPlace,
      _player_ids: cfg.players.map((p) => p.userId),
      _seeds: cfg.players.map((p) => p.seed),
    },
  )

  if (rpcError) return { error: rpcError.message }

  // Se solicitado 'ativo', o RPC já ativa internamente.
  // Se rascunho, RPC insere em rascunho e NÃO ativa.
  // TODO: o RPC atual sempre ativa. Quando status='rascunho' desejado,
  // usar uma variante que não ativa — por ora aceitamos esse comportamento.
  if (!id) return { error: 'Campeonato não foi criado.' }
  // Data de início (RPC não recebe; grava em seguida se informada)
  if (cfg.startDate) {
    await supabase.from('championships').update({ start_date: cfg.startDate }).eq('id', id as string)
  }
  return { id: id as string }
}

