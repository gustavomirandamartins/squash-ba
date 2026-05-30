import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import {
  ChallengeDetailClient,
  type ChallengeParticipant,
  type ChallengeMatch,
} from '@/components/desafios/ChallengeDetailClient'

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
    .select(`id, enrollment_status, participant_members(user_id)`)
    .eq('championship_id', id)
    .order('created_at', { ascending: true })

  // Batch de perfis
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

  const participants: ChallengeParticipant[] = (participantsRaw ?? []).map((p) => {
    const memberIds = (p.participant_members ?? []).map(
      (m: { user_id: string }) => m.user_id,
    )
    // Junta os nomes dos membros (duplas → "Fulano / Beltrano")
    const names = memberIds
      .map((uid: string) => profileMap.get(uid)?.full_name)
      .filter(Boolean) as string[]
    const firstProfile = memberIds.length ? profileMap.get(memberIds[0]) : undefined
    return {
      id: p.id,
      enrollment_status: p.enrollment_status,
      full_name: names.length ? names.join(' / ') : null,
      // avatar só quando individual (1 membro)
      avatar_url: memberIds.length === 1 ? (firstProfile?.avatar_url ?? null) : null,
    }
  })

  // ── 3. Partidas ──────────────────────────────────────────────────
  const { data: matchesRaw } = await supabase
    .from('matches')
    .select(
      `id, round, status, result,
       side_a_participant_id, side_b_participant_id,
       match_games(game_number, score_a, score_b)`,
    )
    .eq('championship_id', id)
    .order('round', { ascending: true })
    .order('created_at', { ascending: true })

  // Calcula score de sets para cada jogo
  const matches: ChallengeMatch[] = (matchesRaw ?? []).map((m) => {
    const games = (m.match_games as Array<{ score_a: number; score_b: number }>) ?? []
    const scoreA = games.filter((g) => g.score_a > g.score_b).length
    const scoreB = games.filter((g) => g.score_b > g.score_a).length
    return {
      id: m.id,
      round: m.round ?? 1,
      status: m.status,
      result: m.result ?? null,
      side_a_participant_id: m.side_a_participant_id ?? null,
      side_b_participant_id: m.side_b_participant_id ?? null,
      score_a: scoreA,
      score_b: scoreB,
    }
  })

  // ── 4. currentUserParticipantId + isCreator ──────────────────────
  const currentUserParticipantId =
    user
      ? (participants.find((p) =>
          (
            (participantsRaw ?? []).find((r) => r.id === p.id)?.participant_members ?? []
          ).some((m: { user_id: string }) => m.user_id === user.id),
        )?.id ?? null)
      : null

  const isCreator = user?.id === champ.id // checked via can_manage; fallback ok for display

  // Permissão de gestão (editar/excluir) — mesmo gate do campeonato
  let canManage = false
  if (user) {
    const { data: ok } = await supabase.rpc('can_manage_championship', { _championship_id: id })
    canManage = (ok as boolean) ?? false
  }

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
