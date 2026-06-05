'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

// ─── Liga (wrap do RPC create_liga_championship como server action) ───────────

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
  const supabase = await createClient()

  // ── Modo duplas: criação manual (o RPC só suporta unit='player') ──────────
  if (cfg.pairs?.length) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Usuário não autenticado.' }

    const { data: champ, error: champErr } = await supabase
      .from('championships')
      .insert({
        name: cfg.name.trim(),
        format: 'liga',
        unit: 'pair',
        status: 'rascunho',
        start_date: cfg.startDate ?? null,
        end_date: cfg.endDate ?? null,
        is_official: cfg.isOfficial ?? false,
        description: cfg.description ?? null,
        venue_id: cfg.venueId ?? null,
        allow_draw: cfg.allowDraw,
        points_win: cfg.pointsWin,
        points_draw: cfg.allowDraw ? cfg.pointsDraw : 0,
        points_loss: cfg.pointsLoss,
        tiebreakers: cfg.tiebreakers,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (champErr || !champ) return { error: champErr?.message ?? 'Erro ao criar campeonato.' }
    const champId = champ.id as string

    const { error: stageErr } = await supabase.from('championship_stages').insert({
      championship_id: champId,
      name: 'Liga',
      ordering: 1,
      kind: 'liga',
      counting: cfg.counting,
      rounds: cfg.rounds,
      sets_to_play: cfg.setsToPlay,
      points_per_set: cfg.pointsPerSet,
      win_by_two: cfg.winByTwo,
      set_draw_enabled: cfg.setDrawEnabled,
      time_minutes: cfg.timeMinutes,
    })
    if (stageErr) {
      await supabase.from('championships').delete().eq('id', champId)
      return { error: stageErr.message }
    }

    for (const pair of cfg.pairs) {
      const { data: part, error: partErr } = await supabase
        .from('participants')
        .insert({ championship_id: champId, kind: 'pair', enrollment_source: 'organizador', enrollment_status: 'confirmado' })
        .select('id')
        .single()
      if (partErr || !part) {
        await supabase.from('championships').delete().eq('id', champId)
        return { error: partErr?.message ?? 'Erro ao criar dupla.' }
      }
      const { error: membErr } = await supabase
        .from('participant_members')
        .insert([{ participant_id: part.id, user_id: pair.p1 }, { participant_id: part.id, user_id: pair.p2 }])
      if (membErr) {
        await supabase.from('championships').delete().eq('id', champId)
        return { error: membErr.message }
      }
    }

    if (cfg.status === 'ativo') {
      const { error: actErr } = await supabase.from('championships').update({ status: 'ativo' }).eq('id', champId)
      if (actErr) return { error: actErr.message }
    }
    return { id: champId }
  }

  // ── Modo jogador: usa o RPC existente ─────────────────────────────────────
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
  // Campos adicionais que o RPC não recebe: start_date, end_date, is_official, …
  const extras: Record<string, unknown> = {}
  if (cfg.startDate) extras.start_date = cfg.startDate
  if (cfg.endDate) extras.end_date = cfg.endDate
  if (cfg.isOfficial) extras.is_official = true
  if (cfg.description) extras.description = cfg.description
  if (cfg.venueId) extras.venue_id = cfg.venueId
  if (Object.keys(extras).length) {
    await supabase.from('championships').update(extras).eq('id', id as string)
  }
  return { id: id as string }
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

  const isPairMode = !!(cfg.pairs?.length)

  // 1. Cria campeonato como rascunho (RLS: championships_insert ok pois created_by = auth.uid())
  const { data: champ, error: champErr } = await supabase
    .from('championships')
    .insert({
      name: cfg.name.trim(),
      format: 'eliminatoria',
      unit: isPairMode ? 'pair' : 'player',
      status: 'rascunho',
      start_date: cfg.startDate ?? null,
      end_date: cfg.endDate ?? null,
      is_official: cfg.isOfficial ?? false,
      description: cfg.description ?? null,
      venue_id: cfg.venueId ?? null,
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

  // 3. Participantes com seeds
  // Normaliza para lista unificada independente de ser jogador ou dupla
  const entries = isPairMode
    ? (cfg.pairs ?? []).map((p) => ({ userIds: [p.p1, p.p2], seed: p.seed ?? null, kind: 'pair' as const }))
    : cfg.players.map((p) => ({ userIds: [p.userId], seed: p.seed, kind: 'player' as const }))

  for (const entry of entries) {
    const { data: part, error: partErr } = await supabase
      .from('participants')
      .insert({
        championship_id: champId,
        kind: entry.kind,
        enrollment_source: 'organizador',
        enrollment_status: 'confirmado',
        seed: entry.seed ?? null,
      })
      .select('id')
      .single()

    if (partErr || !part) {
      await supabase.from('championships').delete().eq('id', champId)
      return { error: partErr?.message ?? 'Erro ao criar participante.' }
    }

    for (const userId of entry.userIds) {
      const { error: memberErr } = await supabase
        .from('participant_members')
        .insert({ participant_id: part.id, user_id: userId })
      if (memberErr) {
        await supabase.from('championships').delete().eq('id', champId)
        return { error: memberErr.message }
      }
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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Usuário não autenticado.' }

  // ── Modo oficial: cria stages + grupos VAZIOS e fica em rascunho ──────────
  // (jogadores entram depois; a alocação em grupos acontece no "Iniciar").
  // O RPC padrão ativa de imediato e exige jogadores, por isso a via manual.
  if (cfg.isOfficial) {
    const { data: champ, error: champErr } = await supabase
      .from('championships')
      .insert({
        name: cfg.name.trim(),
        format: 'grupos_elim',
        unit: 'player',
        status: 'rascunho',
        start_date: cfg.startDate ?? null,
        end_date: cfg.endDate ?? null,
        is_official: true,
        description: cfg.description ?? null,
        venue_id: cfg.venueId ?? null,
        allow_draw: cfg.allowDraw,
        points_win: cfg.pointsWin,
        points_draw: cfg.allowDraw ? cfg.pointsDraw : 0,
        points_loss: cfg.pointsLoss,
        tiebreakers: cfg.tiebreakers,
        has_third_place: cfg.hasThirdPlace,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (champErr || !champ) return { error: champErr?.message ?? 'Erro ao criar campeonato.' }
    const champId = champ.id as string

    const { data: gruposStage, error: gsErr } = await supabase
      .from('championship_stages')
      .insert({
        championship_id: champId,
        name: 'Grupos',
        ordering: 1,
        kind: 'grupos',
        counting: cfg.groupsCounting,
        rounds: cfg.groupsRounds,
        sets_to_play: cfg.groupsSetsToPlay,
        points_per_set: cfg.groupsPointsPerSet,
        win_by_two: cfg.groupsWinByTwo,
        set_draw_enabled: cfg.groupsSetDrawEnabled,
        time_minutes: cfg.groupsTimeMinutes,
      })
      .select('id')
      .single()
    if (gsErr || !gruposStage) {
      await supabase.from('championships').delete().eq('id', champId)
      return { error: gsErr?.message ?? 'Erro ao criar fase de grupos.' }
    }

    const { error: esErr } = await supabase.from('championship_stages').insert({
      championship_id: champId,
      name: 'Eliminatórias',
      ordering: 2,
      kind: 'eliminatoria',
      counting: cfg.elimCounting,
      rounds: 1,
      sets_to_play: cfg.elimSetsToPlay,
      points_per_set: cfg.elimPointsPerSet,
      win_by_two: cfg.elimWinByTwo,
      set_draw_enabled: false,
      time_minutes: cfg.elimTimeMinutes,
    })
    if (esErr) {
      await supabase.from('championships').delete().eq('id', champId)
      return { error: esErr.message }
    }

    // Grupos vazios (A, B, …) — alocação dos jogadores ocorre no início.
    const GROUP_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    for (let gi = 0; gi < cfg.numGroups; gi++) {
      const { error: grpErr } = await supabase
        .from('groups')
        .insert({ stage_id: gruposStage.id, name: `Grupo ${GROUP_NAMES[gi] ?? String(gi + 1)}`, ordering: gi + 1 })
      if (grpErr) {
        await supabase.from('championships').delete().eq('id', champId)
        return { error: grpErr.message }
      }
    }

    // Jogadores iniciais (opcionais) — confirmados, sem grupo ainda.
    for (const p of cfg.players) {
      const { data: part, error: partErr } = await supabase
        .from('participants')
        .insert({
          championship_id: champId,
          kind: 'player',
          enrollment_source: 'organizador',
          enrollment_status: 'confirmado',
          seed: p.seed ?? null,
        })
        .select('id')
        .single()
      if (partErr || !part) {
        await supabase.from('championships').delete().eq('id', champId)
        return { error: partErr?.message ?? 'Erro ao adicionar jogador.' }
      }
      const { error: mErr } = await supabase
        .from('participant_members')
        .insert({ participant_id: part.id, user_id: p.userId })
      if (mErr) {
        await supabase.from('championships').delete().eq('id', champId)
        return { error: mErr.message }
      }
    }

    return { id: champId }
  }

  // ── Modo duplas: criação manual (o RPC só conhece unit='player') ──────────
  if (cfg.pairs?.length) {
    const { data: champ, error: champErr } = await supabase
      .from('championships')
      .insert({
        name: cfg.name.trim(),
        format: 'grupos_elim',
        unit: 'pair',
        status: 'rascunho',
        start_date: cfg.startDate ?? null,
        end_date: cfg.endDate ?? null,
        is_official: cfg.isOfficial ?? false,
        description: cfg.description ?? null,
        venue_id: cfg.venueId ?? null,
        allow_draw: cfg.allowDraw,
        points_win: cfg.pointsWin,
        points_draw: cfg.allowDraw ? cfg.pointsDraw : 0,
        points_loss: cfg.pointsLoss,
        tiebreakers: cfg.tiebreakers,
        has_third_place: cfg.hasThirdPlace,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (champErr || !champ) return { error: champErr?.message ?? 'Erro ao criar campeonato.' }
    const champId = champ.id as string

    // Fase de grupos
    const { data: gruposStage, error: gsErr } = await supabase
      .from('championship_stages')
      .insert({
        championship_id: champId,
        name: 'Grupos',
        ordering: 1,
        kind: 'grupos',
        counting: cfg.groupsCounting,
        rounds: cfg.groupsRounds,
        sets_to_play: cfg.groupsSetsToPlay,
        points_per_set: cfg.groupsPointsPerSet,
        win_by_two: cfg.groupsWinByTwo,
        set_draw_enabled: cfg.groupsSetDrawEnabled,
        time_minutes: cfg.groupsTimeMinutes,
      })
      .select('id')
      .single()
    if (gsErr || !gruposStage) {
      await supabase.from('championships').delete().eq('id', champId)
      return { error: gsErr?.message ?? 'Erro ao criar fase de grupos.' }
    }

    // Fase eliminatória
    const { error: esErr } = await supabase.from('championship_stages').insert({
      championship_id: champId,
      name: 'Eliminatórias',
      ordering: 2,
      kind: 'eliminatoria',
      counting: cfg.elimCounting,
      rounds: 1,
      sets_to_play: cfg.elimSetsToPlay,
      points_per_set: cfg.elimPointsPerSet,
      win_by_two: cfg.elimWinByTwo,
      set_draw_enabled: false,
      time_minutes: cfg.elimTimeMinutes,
    })
    if (esErr) {
      await supabase.from('championships').delete().eq('id', champId)
      return { error: esErr.message }
    }

    // Grupos (A, B, C, …)
    const GROUP_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    const groupIds: string[] = []
    for (let gi = 0; gi < cfg.numGroups; gi++) {
      const { data: grp, error: grpErr } = await supabase
        .from('groups')
        .insert({ stage_id: gruposStage.id, name: `Grupo ${GROUP_NAMES[gi] ?? String(gi + 1)}`, ordering: gi + 1 })
        .select('id')
        .single()
      if (grpErr || !grp) {
        await supabase.from('championships').delete().eq('id', champId)
        return { error: grpErr?.message ?? 'Erro ao criar grupo.' }
      }
      groupIds.push(grp.id as string)
    }

    // Participantes (duplas) com group_id
    for (const pair of cfg.pairs) {
      const groupId = groupIds[pair.groupIndex] ?? groupIds[0]
      const { data: part, error: partErr } = await supabase
        .from('participants')
        .insert({
          championship_id: champId,
          kind: 'pair',
          group_id: groupId,
          enrollment_source: 'organizador',
          enrollment_status: 'confirmado',
          seed: pair.seed ?? null,
        })
        .select('id')
        .single()
      if (partErr || !part) {
        await supabase.from('championships').delete().eq('id', champId)
        return { error: partErr?.message ?? 'Erro ao criar dupla.' }
      }
      const { error: membErr } = await supabase
        .from('participant_members')
        .insert([{ participant_id: part.id, user_id: pair.p1 }, { participant_id: part.id, user_id: pair.p2 }])
      if (membErr) {
        await supabase.from('championships').delete().eq('id', champId)
        return { error: membErr.message }
      }
    }

    // Ativa → trigger gera os jogos da fase de grupos
    const { error: actErr } = await supabase.from('championships').update({ status: 'ativo' }).eq('id', champId)
    if (actErr) return { error: actErr.message }
    if (cfg.startDate) {
      await supabase.from('championships').update({ start_date: cfg.startDate }).eq('id', champId)
    }
    return { id: champId }
  }

  // ── Modo jogador: usa o RPC existente ─────────────────────────────────────
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
  // Campos adicionais que o RPC não recebe: start_date e is_official
  const extras2: Record<string, unknown> = {}
  if (cfg.startDate) extras2.start_date = cfg.startDate
  if (cfg.isOfficial) extras2.is_official = true
  if (Object.keys(extras2).length) {
    await supabase.from('championships').update(extras2).eq('id', id as string)
  }
  return { id: id as string }
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

  // Já inscrito? evita duplicidade
  const { data: existing } = await supabase
    .from('participants')
    .select('id, participant_members!inner(user_id)')
    .eq('championship_id', championshipId)
    .eq('participant_members.user_id', userId)
    .limit(1)
  if (existing && existing.length > 0) {
    return { error: 'Jogador já inscrito neste campeonato.' }
  }

  const { data: part, error: partErr } = await supabase
    .from('participants')
    .insert({
      championship_id: championshipId,
      kind: 'player',
      enrollment_source: 'organizador',
      enrollment_status: 'confirmado',
    })
    .select('id')
    .single()
  if (partErr || !part) return { error: partErr?.message ?? 'Erro ao adicionar jogador.' }

  const { error: mErr } = await supabase
    .from('participant_members')
    .insert({ participant_id: part.id, user_id: userId })
  if (mErr) {
    await supabase.from('participants').delete().eq('id', part.id)
    return { error: mErr.message }
  }
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

  const { data: champ, error: cErr } = await supabase
    .from('championships')
    .select('id, format, status, is_official')
    .eq('id', championshipId)
    .single()
  if (cErr || !champ) return { error: cErr?.message ?? 'Campeonato não encontrado.' }
  if (champ.status !== 'rascunho') return { error: 'O campeonato já foi iniciado.' }

  // Confirmados
  const { data: confirmed } = await supabase
    .from('participants')
    .select('id, seed')
    .eq('championship_id', championshipId)
    .eq('enrollment_status', 'confirmado')
  const parts = confirmed ?? []
  if (parts.length < 2) return { error: 'É preciso ao menos 2 jogadores confirmados.' }

  // Remove pendentes que não foram aprovados (não entram no chaveamento)
  await supabase
    .from('participants')
    .delete()
    .eq('championship_id', championshipId)
    .eq('enrollment_status', 'pendente')

  // grupos_elim: aloca confirmados nos grupos via snake draft
  if (champ.format === 'grupos_elim') {
    const { data: gruposStage } = await supabase
      .from('championship_stages')
      .select('id')
      .eq('championship_id', championshipId)
      .eq('kind', 'grupos')
      .single()
    if (!gruposStage) return { error: 'Fase de grupos não encontrada.' }

    const { data: groups } = await supabase
      .from('groups')
      .select('id, ordering')
      .eq('stage_id', gruposStage.id)
      .order('ordering', { ascending: true })
    const groupIds = (groups ?? []).map((g) => g.id as string)
    if (groupIds.length === 0) return { error: 'Nenhum grupo configurado.' }

    // Snake draft: ordena por seed (nulls por último), distribui em zigue-zague.
    const ordered = [...parts].sort((a, b) => {
      const sa = a.seed ?? 9999
      const sb = b.seed ?? 9999
      return sa - sb
    })
    const n = groupIds.length
    for (let i = 0; i < ordered.length; i++) {
      const round = Math.floor(i / n)
      const pos = i % n
      const gi = round % 2 === 0 ? pos : n - 1 - pos
      const { error: upErr } = await supabase
        .from('participants')
        .update({ group_id: groupIds[gi] })
        .eq('id', ordered[i].id)
      if (upErr) return { error: upErr.message }
    }
  }

  // Ativa → trigger championship_status gera as partidas
  const { error: actErr } = await supabase
    .from('championships')
    .update({ status: 'ativo' })
    .eq('id', championshipId)
  if (actErr) return { error: actErr.message }

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

  const { data: champ, error: cErr } = await supabase
    .from('championships')
    .select('id, status, is_official, format')
    .eq('id', id)
    .single()
  if (cErr || !champ) return { error: cErr?.message ?? 'Campeonato não encontrado.' }
  if (!champ.is_official) return { error: 'Apenas campeonatos oficiais podem ser editados aqui.' }
  if (champ.status !== 'rascunho') return { error: 'Só é possível editar antes do início.' }

  // 1. Campeonato
  const { error: upErr } = await supabase
    .from('championships')
    .update({
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
    })
    .eq('id', id)
  if (upErr) return { error: upErr.message }

  // 2. Fases
  for (const s of p.stages) {
    const { error: sErr } = await supabase
      .from('championship_stages')
      .update({
        counting: s.counting,
        rounds: s.rounds,
        sets_to_play: s.setsToPlay,
        points_per_set: s.pointsPerSet,
        win_by_two: s.winByTwo,
        set_draw_enabled: s.setDrawEnabled,
        time_minutes: s.timeMinutes,
      })
      .eq('id', s.id)
    if (sErr) return { error: sErr.message }
  }

  // 3. grupos_elim: recria grupos vazios se o número mudou
  if (champ.format === 'grupos_elim' && p.numGroups && p.numGroups > 0) {
    const { data: gruposStage } = await supabase
      .from('championship_stages')
      .select('id')
      .eq('championship_id', id)
      .eq('kind', 'grupos')
      .single()
    if (gruposStage) {
      const { data: existing } = await supabase
        .from('groups')
        .select('id')
        .eq('stage_id', gruposStage.id)
      if ((existing?.length ?? 0) !== p.numGroups) {
        // limpa vínculo dos participantes e recria os grupos
        await supabase
          .from('participants')
          .update({ group_id: null })
          .eq('championship_id', id)
        await supabase.from('groups').delete().eq('stage_id', gruposStage.id)
        const GROUP_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
        for (let gi = 0; gi < p.numGroups; gi++) {
          const { error: gErr } = await supabase
            .from('groups')
            .insert({ stage_id: gruposStage.id, name: `Grupo ${GROUP_NAMES[gi] ?? String(gi + 1)}`, ordering: gi + 1 })
          if (gErr) return { error: gErr.message }
        }
      }
    }
  }

  revalidatePath(`/campeonatos/${id}`)
  return { ok: true }
}
