import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import {
  ChallengeDetailClient,
  type ChallengeParticipant,
  type ChallengeMatch,
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
       championship_stages(rounds)`,
    )
    .eq('id', id)
    .in('format', ['desafio'])
    .single()

  if (!champ) notFound()

  const rounds = champ.championship_stages?.[0]?.rounds ?? 1

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

  function setScore(m: { match_games?: Array<{ score_a: number; score_b: number }> | null }) {
    const games = m.match_games ?? []
    const a = games.filter((g) => g.score_a > g.score_b).length
    const b = games.filter((g) => g.score_b > g.score_a).length
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
    />
  )
}
