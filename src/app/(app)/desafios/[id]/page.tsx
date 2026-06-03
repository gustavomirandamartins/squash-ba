import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import {
  ChallengeDetailClient,
  type ChallengeParticipant,
  type ChallengeMatch,
  type ChallengeStanding,
} from '@/components/desafios/ChallengeDetailClient'
import {
  TeamChallengeView,
  type TeamParticipant,
  type TeamMatch,
  type GeneralStanding,
  type TeamStanding,
  type TeamInfo,
} from '@/components/desafios/TeamChallengeView'

export const metadata = { title: 'Desafio' }

export default async function DesafioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ── 1. Desafio + fase ────────────────────────────────────────────
  const { data: champ } = await supabase
    .from('championships')
    .select(
      `id, name, status, format, unit, has_final,
       points_win, points_draw, points_loss, tiebreakers,
       championship_stages(rounds, counting, points_per_set, win_by_two, set_draw_enabled, sets_to_play)`,
    )
    .eq('id', id)
    .in('format', ['desafio'])
    .single()

  if (!champ) notFound()

  const stageRaw = champ.championship_stages?.[0]
  const rounds = stageRaw?.rounds ?? 1

  // Config da fase (para recálculo offline de resultados/classificação).
  const stageCfg = {
    counting: (stageRaw?.counting as string) ?? 'set',
    points_per_set: (stageRaw?.points_per_set as number) ?? 11,
    win_by_two: (stageRaw?.win_by_two as boolean) ?? true,
    set_draw_enabled: (stageRaw?.set_draw_enabled as boolean) ?? false,
    sets_to_play: (stageRaw?.sets_to_play as number) ?? 3,
  }
  const champCfg = {
    pointsWin: (champ.points_win as number) ?? 3,
    pointsDraw: (champ.points_draw as number) ?? 1,
    pointsLoss: (champ.points_loss as number) ?? 0,
    tiebreakers: (champ.tiebreakers as string[]) ?? [],
  }

  // ── 2. Participantes + membros + perfis ──────────────────────────
  const { data: participantsRaw } = await supabase
    .from('participants')
    .select(`id, enrollment_status, championship_team_id, participant_members(user_id)`)
    .eq('championship_id', id)
    .order('created_at', { ascending: true })

  const allUserIds = (participantsRaw ?? []).flatMap((p) =>
    (p.participant_members ?? []).map((m: { user_id: string }) => m.user_id),
  )
  const { data: profiles } = allUserIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', allUserIds)
    : { data: [] }

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  // Info resolvida por participante (nome combinado + avatar + teamId)
  const resolved = (participantsRaw ?? []).map((p) => {
    const memberIds = (p.participant_members ?? []).map((m: { user_id: string }) => m.user_id)
    const names = memberIds
      .map((uid: string) => profileMap.get(uid)?.full_name)
      .filter(Boolean) as string[]
    const firstProfile = memberIds.length ? profileMap.get(memberIds[0]) : undefined
    return {
      id: p.id as string,
      enrollment_status: p.enrollment_status as string,
      teamId: (p as { championship_team_id?: string | null }).championship_team_id ?? null,
      full_name: names.length ? names.join(' / ') : null,
      avatar_url: memberIds.length === 1 ? (firstProfile?.avatar_url ?? null) : null,
      memberIds,
    }
  })

  // ── 3. Partidas ──────────────────────────────────────────────────
  const { data: matchesRaw } = await supabase
    .from('matches')
    .select(
      `id, round, status, result, bracket_slot,
       side_a_participant_id, side_b_participant_id,
       match_games(game_number, score_a, score_b)`,
    )
    .eq('championship_id', id)
    .order('round', { ascending: true })
    .order('created_at', { ascending: true })

  /**
   * Conta sets vencidos por cada lado usando a mesma lógica do servidor
   * (resolve_match): respeita points_per_set e win_by_two.
   * Comparação pura de pontos (score_a > score_b) contaria sets em andamento
   * como finalizados — ex.: 8-5 mid-set aparecia como 1-0 no placar de sets.
   */
  function setScore(m: { match_games?: Array<{ game_number: number; score_a: number; score_b: number }> | null }) {
    const games = (m.match_games ?? []).sort((x, y) => x.game_number - y.game_number)
    const P = stageCfg.points_per_set
    const w2 = stageCfg.win_by_two
    let a = 0, b = 0
    for (const g of games) {
      if (w2) {
        if (g.score_a >= P && g.score_a - g.score_b >= 2) a++
        else if (g.score_b >= P && g.score_b - g.score_a >= 2) b++
      } else {
        if (g.score_a >= P && g.score_a > g.score_b) a++
        else if (g.score_b >= P && g.score_b > g.score_a) b++
      }
    }
    return { a, b }
  }

  // ── canManage ─────────────────────────────────────────────────────
  let canManage = false
  if (user) {
    const { data: ok } = await supabase.rpc('can_manage_championship', { _championship_id: id })
    canManage = (ok as boolean) ?? false
  }

  // ════════════════════════════════════════════════════════════════
  // Desafio por TIMES → tela dedicada
  // ════════════════════════════════════════════════════════════════
  if (champ.unit === 'team') {
    const [{ data: teamsRaw }, { data: standingsRaw }, { data: teamStRaw }] = await Promise.all([
      supabase
        .from('championship_teams')
        .select('id, name, ordering')
        .eq('championship_id', id)
        .order('ordering', { ascending: true }),
      supabase.rpc('get_standings', { _championship_id: id }),
      supabase.from('v_team_standings').select('*').eq('championship_id', id),
    ])

    const teams: TeamInfo[] = (teamsRaw ?? []).map((t) => ({ id: t.id, name: t.name }))

    const teamParticipants: TeamParticipant[] = resolved.map((p) => ({
      id: p.id,
      teamId: p.teamId,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
    }))

    const teamMatches: TeamMatch[] = (matchesRaw ?? []).map((m) => {
      const s = setScore(m)
      return {
        id: m.id,
        round: m.round ?? 1,
        status: m.status,
        result: m.result ?? null,
        side_a_participant_id: m.side_a_participant_id ?? null,
        side_b_participant_id: m.side_b_participant_id ?? null,
        score_a: s.a,
        score_b: s.b,
        bracket_slot: (m.bracket_slot as number | null) ?? null,
        match_games: (m.match_games as { game_number: number; score_a: number; score_b: number }[]) ?? [],
      }
    })

    const general = (standingsRaw ?? []) as GeneralStanding[]
    const teamStandings = (teamStRaw ?? []) as TeamStanding[]
    const finalExists = teamMatches.some((m) => m.bracket_slot === -1)

    return (
      <TeamChallengeView
        challenge={{
          id: champ.id,
          name: champ.name,
          status: champ.status,
          rounds,
          hasFinal: (champ.has_final as boolean) ?? false,
        }}
        teams={teams}
        participants={teamParticipants}
        matches={teamMatches}
        general={general}
        teamStandings={teamStandings}
        canManage={canManage}
        finalExists={finalExists}
        stage={stageCfg}
        champ={champCfg}
      />
    )
  }

  // ════════════════════════════════════════════════════════════════
  // Desafio 1v1 / Duplas → tela existente
  // ════════════════════════════════════════════════════════════════
  const participants: ChallengeParticipant[] = resolved.map((p) => ({
    id: p.id,
    enrollment_status: p.enrollment_status,
    full_name: p.full_name,
    avatar_url: p.avatar_url,
  }))

  // Classificação (Pts/V/E/D/sets…) — desafio é uma linha de championships, então
  // get_standings funciona igual aos campeonatos. Também montamos offlineData para
  // recálculo ao vivo sem rede (espelha a lógica do servidor).
  const { data: standingsRaw } = await supabase.rpc('get_standings', { _championship_id: id })
  const initialStandings = (standingsRaw ?? []) as ChallengeStanding[]

  const participantAvatars: Record<string, string | null> = {}
  for (const p of resolved) participantAvatars[p.id] = p.avatar_url

  const confirmed = resolved.filter((p) => p.enrollment_status === 'confirmado')
  const offlineData = {
    matches: (matchesRaw ?? []).map((m) => ({
      id: m.id,
      side_a_participant_id: m.side_a_participant_id ?? null,
      side_b_participant_id: m.side_b_participant_id ?? null,
      match_games: (m.match_games as { game_number: number; score_a: number; score_b: number }[]) ?? [],
    })),
    participants: confirmed.map((p) => ({ id: p.id, name: p.full_name })),
    stage: stageCfg,
    champ: champCfg,
  }

  const matches: ChallengeMatch[] = (matchesRaw ?? []).map((m) => {
    const s = setScore(m)
    return {
      id: m.id,
      round: m.round ?? 1,
      status: m.status,
      result: m.result ?? null,
      side_a_participant_id: m.side_a_participant_id ?? null,
      side_b_participant_id: m.side_b_participant_id ?? null,
      score_a: s.a,
      score_b: s.b,
      match_games: (m.match_games as { game_number: number; score_a: number; score_b: number }[]) ?? [],
    }
  })

  const currentUserParticipantId =
    user
      ? (resolved.find((p) => p.memberIds.includes(user.id))?.id ?? null)
      : null

  const isCreator = user?.id === champ.id // fallback de exibição; gate real é can_manage

  return (
    <ChallengeDetailClient
      challenge={{
        id: champ.id,
        name: champ.name,
        status: champ.status,
        format: champ.format,
        unit: champ.unit,
        rounds,
      }}
      participants={participants}
      matches={matches}
      currentUserParticipantId={currentUserParticipantId}
      isCreator={isCreator}
      canManage={canManage}
      stage={stageCfg}
      initialStandings={initialStandings}
      participantAvatars={participantAvatars}
      offlineData={offlineData}
    />
  )
}
