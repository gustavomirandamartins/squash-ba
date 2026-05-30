'use server'

import { createClient } from '@/utils/supabase/server'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ChallengeConfig = {
  name: string
  rounds: number
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
}

// ─── Criar Desafio 1v1 ────────────────────────────────────────────────────────

export async function createDesafio1v1(
  config: ChallengeConfig,
  opponentId: string,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Usuário não autenticado.' }
  if (opponentId === user.id) return { error: 'Você não pode desafiar a si mesmo.' }

  const allowDraw = config.counting === 'tempo' || config.setDrawEnabled

  // 1. Cria o championship como rascunho (RLS: auth.uid() = created_by)
  const { data: champ, error: champErr } = await supabase
    .from('championships')
    .insert({
      name: config.name.trim(),
      format: 'desafio',
      unit: 'player',
      status: 'rascunho',
      allow_draw: allowDraw,
      points_win: config.pointsWin,
      points_draw: allowDraw ? config.pointsDraw : 0,
      points_loss: config.pointsLoss,
      tiebreakers: config.tiebreakers,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (champErr || !champ) return { error: champErr?.message ?? 'Erro ao criar desafio.' }
  const champId = champ.id

  // 2. Fase única (RLS: can_manage_championship passa pois user é creator)
  const { error: stageErr } = await supabase.from('championship_stages').insert({
    championship_id: champId,
    name: 'Fase única',
    ordering: 1,
    kind: 'liga',
    counting: config.counting,
    rounds: config.rounds,
    sets_to_play: config.setsToPlay,
    points_per_set: config.pointsPerSet,
    win_by_two: config.winByTwo,
    set_draw_enabled: config.setDrawEnabled,
    time_minutes: config.timeMinutes,
  })

  if (stageErr) {
    await supabase.from('championships').delete().eq('id', champId)
    return { error: stageErr.message }
  }

  // 3. Participante A — criador (confirmado)
  const { data: partA, error: partAErr } = await supabase
    .from('participants')
    .insert({
      championship_id: champId,
      kind: 'player',
      enrollment_source: 'organizador',
      enrollment_status: 'confirmado',
    })
    .select('id')
    .single()

  if (partAErr || !partA) {
    await supabase.from('championships').delete().eq('id', champId)
    return { error: partAErr?.message ?? 'Erro ao criar participante.' }
  }

  const { error: memberAErr } = await supabase
    .from('participant_members')
    .insert({ participant_id: partA.id, user_id: user.id })

  if (memberAErr) {
    await supabase.from('championships').delete().eq('id', champId)
    return { error: memberAErr.message }
  }

  // 4. Participante B — oponente (pendente)
  const { data: partB, error: partBErr } = await supabase
    .from('participants')
    .insert({
      championship_id: champId,
      kind: 'player',
      enrollment_source: 'jogador',
      enrollment_status: 'pendente',
    })
    .select('id')
    .single()

  if (partBErr || !partB) {
    await supabase.from('championships').delete().eq('id', champId)
    return { error: partBErr?.message ?? 'Erro ao convidar oponente.' }
  }

  const { error: memberBErr } = await supabase
    .from('participant_members')
    .insert({ participant_id: partB.id, user_id: opponentId })

  if (memberBErr) {
    await supabase.from('championships').delete().eq('id', champId)
    return { error: memberBErr.message }
  }

  return { id: champId }
}

// ─── Criar Desafio de Duplas (2v2) ────────────────────────────────────────────
// "Organizador monta tudo": escolhe parceiro + dupla adversária. Sem convite —
// ambas as duplas entram confirmadas e o desafio ativa imediatamente.

export async function createDesafioDuplas(
  config: ChallengeConfig,
  partnerId: string,
  opponentIds: [string, string],
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Usuário não autenticado.' }

  const teamA = [user.id, partnerId]
  const teamB = opponentIds
  const all = [...teamA, ...teamB]
  if (new Set(all).size !== 4) {
    return { error: 'Selecione 4 jogadores distintos (você, seu parceiro e a dupla adversária).' }
  }

  const allowDraw = config.counting === 'tempo' || config.setDrawEnabled

  // 1. Championship (desafio, unit='pair') em rascunho
  const { data: champ, error: champErr } = await supabase
    .from('championships')
    .insert({
      name: config.name.trim(),
      format: 'desafio',
      unit: 'pair',
      status: 'rascunho',
      allow_draw: allowDraw,
      points_win: config.pointsWin,
      points_draw: allowDraw ? config.pointsDraw : 0,
      points_loss: config.pointsLoss,
      tiebreakers: config.tiebreakers,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (champErr || !champ) return { error: champErr?.message ?? 'Erro ao criar desafio.' }
  const champId = champ.id

  const cleanup = async (msg: string) => {
    await supabase.from('championships').delete().eq('id', champId)
    return { error: msg }
  }

  // 2. Fase única
  const { error: stageErr } = await supabase.from('championship_stages').insert({
    championship_id: champId,
    name: 'Fase única',
    ordering: 1,
    kind: 'liga',
    counting: config.counting,
    rounds: config.rounds,
    sets_to_play: config.setsToPlay,
    points_per_set: config.pointsPerSet,
    win_by_two: config.winByTwo,
    set_draw_enabled: config.setDrawEnabled,
    time_minutes: config.timeMinutes,
  })
  if (stageErr) return cleanup(stageErr.message)

  // 3. Cria as duas duplas (participants kind='pair', confirmadas) + membros
  async function createPair(memberIds: string[]): Promise<string | null> {
    const { data: part, error: partErr } = await supabase
      .from('participants')
      .insert({
        championship_id: champId,
        kind: 'pair',
        enrollment_source: 'organizador',
        enrollment_status: 'confirmado',
      })
      .select('id')
      .single()
    if (partErr || !part) return null
    const { error: memErr } = await supabase
      .from('participant_members')
      .insert(memberIds.map((uid) => ({ participant_id: part.id, user_id: uid })))
    if (memErr) return null
    return part.id
  }

  const pairA = await createPair(teamA)
  if (!pairA) return cleanup('Erro ao criar a sua dupla.')
  const pairB = await createPair(teamB)
  if (!pairB) return cleanup('Erro ao criar a dupla adversária.')

  // 4. Ativa → trigger gera o round-robin (rounds partidas entre as duas duplas)
  const { error: activateErr } = await supabase
    .from('championships')
    .update({ status: 'ativo' })
    .eq('id', champId)
  if (activateErr) return cleanup(activateErr.message)

  return { id: champId }
}

// ─── Criar Desafio de Times (NxN) ─────────────────────────────────────────────
// Organizador escolhe 2 times registrados e metade dos jogadores de cada um.
// O backend (generate_team_challenge_matches) gera jogos cruzados entre times
// opostos. has_final opcional → final entre o melhor de cada time (gerada depois).

export type TeamSidePayload = {
  teamId: string
  name: string
  playerIds: string[]
}

export async function createDesafioTimes(
  config: ChallengeConfig,
  hasFinal: boolean,
  teamA: TeamSidePayload,
  teamB: TeamSidePayload,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Usuário não autenticado.' }

  if (teamA.teamId === teamB.teamId) return { error: 'Escolha dois times diferentes.' }
  if (teamA.playerIds.length < 1 || teamB.playerIds.length < 1) {
    return { error: 'Selecione os jogadores dos dois times.' }
  }
  if (teamA.playerIds.length !== teamB.playerIds.length) {
    return { error: 'Os dois times precisam ter a mesma quantidade de jogadores.' }
  }
  const all = [...teamA.playerIds, ...teamB.playerIds]
  if (new Set(all).size !== all.length) {
    return { error: 'Um jogador não pode estar nos dois times.' }
  }

  const allowDraw = config.counting === 'tempo' || config.setDrawEnabled

  // 1. Championship (desafio, unit='team', has_final)
  const { data: champ, error: champErr } = await supabase
    .from('championships')
    .insert({
      name: config.name.trim(),
      format: 'desafio',
      unit: 'team',
      status: 'rascunho',
      allow_draw: allowDraw,
      has_final: hasFinal,
      points_win: config.pointsWin,
      points_draw: allowDraw ? config.pointsDraw : 0,
      points_loss: config.pointsLoss,
      tiebreakers: config.tiebreakers,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (champErr || !champ) return { error: champErr?.message ?? 'Erro ao criar desafio.' }
  const champId = champ.id

  const cleanup = async (msg: string) => {
    await supabase.from('championships').delete().eq('id', champId)
    return { error: msg }
  }

  // 2. Fase única
  const { error: stageErr } = await supabase.from('championship_stages').insert({
    championship_id: champId,
    name: 'Fase única',
    ordering: 1,
    kind: 'liga',
    counting: config.counting,
    rounds: config.rounds,
    sets_to_play: config.setsToPlay,
    points_per_set: config.pointsPerSet,
    win_by_two: config.winByTwo,
    set_draw_enabled: config.setDrawEnabled,
    time_minutes: config.timeMinutes,
  })
  if (stageErr) return cleanup(stageErr.message)

  // 3. Cria os 2 times do desafio + participantes de cada um
  async function createTeamSide(side: TeamSidePayload, ordering: number): Promise<string | null> {
    const { data: ct, error: ctErr } = await supabase
      .from('championship_teams')
      .insert({
        championship_id: champId,
        name: side.name,
        team_id: side.teamId,
        ordering,
      })
      .select('id')
      .single()
    if (ctErr || !ct) return ctErr?.message ?? 'Erro ao criar time.'

    for (const uid of side.playerIds) {
      const { data: part, error: partErr } = await supabase
        .from('participants')
        .insert({
          championship_id: champId,
          kind: 'player',
          championship_team_id: ct.id,
          enrollment_source: 'organizador',
          enrollment_status: 'confirmado',
        })
        .select('id')
        .single()
      if (partErr || !part) return partErr?.message ?? 'Erro ao criar participante.'
      const { error: memErr } = await supabase
        .from('participant_members')
        .insert({ participant_id: part.id, user_id: uid })
      if (memErr) return memErr.message
    }
    return null
  }

  const errA = await createTeamSide(teamA, 0)
  if (errA) return cleanup(errA)
  const errB = await createTeamSide(teamB, 1)
  if (errB) return cleanup(errB)

  // 4. Ativa → trigger gera os jogos cruzados (cada jogador de A x cada de B)
  const { error: activateErr } = await supabase
    .from('championships')
    .update({ status: 'ativo' })
    .eq('id', champId)
  if (activateErr) return cleanup(activateErr.message)

  return { id: champId }
}
