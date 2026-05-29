import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { ScoreScreen } from '@/components/score/ScoreScreen'
import type { GameScore, ConflictSnapshot } from '@/lib/score-engine/useScoreEngine'

export const metadata = { title: 'Placar' }

export default async function CampeonatoScorePage({
  params,
}: {
  params: Promise<{ id: string; matchId: string }>
}) {
  const { id, matchId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ── Match + games ─────────────────────────────────────────────────────────
  const { data: matchRaw } = await supabase
    .from('matches')
    .select(
      `id, status, result, conflict_server_snapshot, stage_id,
       side_a_participant_id, side_b_participant_id, championship_id,
       match_games(game_number, score_a, score_b)`,
    )
    .eq('id', matchId)
    .single()

  if (!matchRaw) notFound()

  // ── Stage do match ────────────────────────────────────────────────────────
  const stageId = matchRaw.stage_id as string | null
  type StageRow = {
    id: string
    counting: string
    sets_to_play: number
    points_per_set: number
    win_by_two: boolean
    set_draw_enabled: boolean
    time_minutes: number | null
  }
  let stage: StageRow | null = null
  if (stageId) {
    const { data: stageRaw } = await supabase
      .from('championship_stages')
      .select('id, counting, sets_to_play, points_per_set, win_by_two, set_draw_enabled, time_minutes')
      .eq('id', stageId)
      .single()
    stage = stageRaw as StageRow | null
  }

  // Fallback: busca primeira fase do campeonato
  if (!stage) {
    const { data: stageRaw } = await supabase
      .from('championship_stages')
      .select('id, counting, sets_to_play, points_per_set, win_by_two, set_draw_enabled, time_minutes')
      .eq('championship_id', matchRaw.championship_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    stage = stageRaw as StageRow | null
  }

  // ── Participantes + perfis ────────────────────────────────────────────────
  const sideAId = matchRaw.side_a_participant_id as string | null
  const sideBId = matchRaw.side_b_participant_id as string | null

  const participantIds = [sideAId, sideBId].filter(Boolean) as string[]

  type MemberRow = { participant_id: string; user_id: string }
  const { data: membersRaw } = participantIds.length
    ? await supabase
        .from('participant_members')
        .select('participant_id, user_id')
        .in('participant_id', participantIds)
    : { data: [] }

  const allUserIds = (membersRaw ?? []).map((m: MemberRow) => m.user_id)
  const { data: profiles } = allUserIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', allUserIds)
    : { data: [] }

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
  const membersByParticipant = new Map<string, MemberRow[]>()
  for (const m of (membersRaw ?? []) as MemberRow[]) {
    const arr = membersByParticipant.get(m.participant_id) ?? []
    arr.push(m)
    membersByParticipant.set(m.participant_id, arr)
  }

  function resolveParticipant(pid: string | null) {
    if (!pid) return { name: null, avatarUrl: null }
    const members = membersByParticipant.get(pid) ?? []
    const names = members
      .map((m) => profileMap.get(m.user_id)?.full_name)
      .filter(Boolean) as string[]
    const avatarUrl =
      members.length === 1
        ? (profileMap.get(members[0].user_id)?.avatar_url ?? null)
        : null
    return { name: names.join(' / ') || null, avatarUrl: avatarUrl ?? null }
  }

  const sideA = resolveParticipant(sideAId)
  const sideB = resolveParticipant(sideBId)

  // ── canManage ─────────────────────────────────────────────────────────────
  let canManage = false
  if (user) {
    try {
      const { data: ok } = await supabase.rpc('can_manage_championship', {
        _championship_id: matchRaw.championship_id,
      })
      canManage = (ok as boolean) ?? false
    } catch {
      canManage = false
    }
    // Participante do jogo também pode gerir
    if (!canManage) {
      const myPid = ((membersRaw ?? []) as MemberRow[]).find(
        (m) => m.user_id === user.id,
      )?.participant_id
      if (myPid && (myPid === sideAId || myPid === sideBId)) {
        canManage = true
      }
    }
  }

  // ── Initial state ─────────────────────────────────────────────────────────
  const initialGames = (
    (matchRaw.match_games as GameScore[] | null) ?? []
  ).sort((a, b) => a.game_number - b.game_number)

  const initialConflictSnapshot =
    matchRaw.status === 'revisao'
      ? ((matchRaw.conflict_server_snapshot as ConflictSnapshot | null) ?? null)
      : null

  return (
    <ScoreScreen
      matchId={matchId}
      backHref={`/campeonatos/${id}`}
      sideA={sideA}
      sideB={sideB}
      counting={stage?.counting ?? 'sets'}
      setsToPlay={stage?.sets_to_play ?? 3}
      pointsPerSet={stage?.points_per_set ?? 11}
      winByTwo={stage?.win_by_two ?? true}
      setDrawEnabled={stage?.set_draw_enabled ?? false}
      timeMinutes={stage?.time_minutes ?? null}
      canManage={canManage}
      initialGames={initialGames}
      initialStatus={matchRaw.status}
      initialResult={(matchRaw.result as string | null) ?? null}
      initialConflictSnapshot={initialConflictSnapshot}
    />
  )
}
