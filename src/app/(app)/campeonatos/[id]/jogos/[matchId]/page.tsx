import { notFound } from 'next/navigation'
import { createClient, getAuthUser } from '@/utils/supabase/server'
import { ScoreScreen } from '@/components/score/ScoreScreen'
import { reopenMatch, reopenMatchByParticipant, updateMatchSchedule, clearMatchData } from '@/app/(app)/jogos/actions'
import type { GameScore, ConflictSnapshot } from '@/lib/score-engine/useScoreEngine'

export const metadata = { title: 'Placar' }

export default async function CampeonatoScorePage({
  params,
}: {
  params: Promise<{ id: string; matchId: string }>
}) {
  const { id, matchId } = await params
  const supabase = await createClient()

  const user = await getAuthUser()

  // ── Match + games ─────────────────────────────────────────────────────────
  const { data: matchRaw } = await supabase
    .from('matches')
    .select(
      `id, status, result, is_wo, is_double_wo, bracket_slot, conflict_server_snapshot, stage_id, scheduled_at, duration_seconds,
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
  let isOrganizer = false
  if (user) {
    try {
      const { data: ok } = await supabase.rpc('can_manage_championship', {
        _championship_id: matchRaw.championship_id,
      })
      canManage = (ok as boolean) ?? false
      isOrganizer = canManage
    } catch {
      canManage = false
    }
    // Participante do jogo também pode gerir (mas NÃO reabrir)
    if (!canManage) {
      const myPid = ((membersRaw ?? []) as MemberRow[]).find(
        (m) => m.user_id === user.id,
      )?.participant_id
      if (myPid && (myPid === sideAId || myPid === sideBId)) {
        canManage = true
      }
    }
  }

  // Inline server actions: capturam matchId do escopo externo
  async function handleReopenMatch() {
    'use server'
    return reopenMatch(matchId)
  }

  async function handleReopenMatchByParticipant() {
    'use server'
    return reopenMatchByParticipant(matchId)
  }

  async function handleUpdateSchedule(iso: string | null) {
    'use server'
    return updateMatchSchedule(matchId, iso)
  }

  async function handleClearMatch() {
    'use server'
    return clearMatchData(matchId)
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
      isOrganizer={isOrganizer}
      allowDoubleWo={(matchRaw.bracket_slot ?? 0) === 0}
      initialIsWo={!!matchRaw.is_wo}
      initialIsDoubleWo={!!matchRaw.is_double_wo}
      onReopenMatch={isOrganizer ? handleReopenMatch : canManage ? handleReopenMatchByParticipant : undefined}
      onClearMatch={canManage ? handleClearMatch : undefined}
      scheduledAt={(matchRaw as { scheduled_at?: string | null }).scheduled_at ?? null}
      onUpdateSchedule={canManage ? handleUpdateSchedule : undefined}
      initialGames={initialGames}
      initialStatus={matchRaw.status}
      initialResult={(matchRaw.result as string | null) ?? null}
      initialConflictSnapshot={initialConflictSnapshot}
      initialDuration={(matchRaw as { duration_seconds?: number | null }).duration_seconds ?? 0}
    />
  )
}
