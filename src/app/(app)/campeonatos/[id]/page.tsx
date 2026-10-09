import { notFound } from 'next/navigation'
import { createClient, getAuthUser } from '@/utils/supabase/server'
import { ChampionshipDetailClient, type Standing } from '@/components/campeonatos/ChampionshipDetailClient'

export const metadata = { title: 'Campeonato' }

export default async function ChampionshipPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Um único client por request — crítico para consistência de sessão
  const supabase = await createClient()

  // ── 1ª rodada, em paralelo: tudo que só depende do id ──────────────────────
  // (antes eram ~10 consultas em fila, cada uma esperando a anterior)
  const [
    user,
    { data: champ },
    { data: matchesRaw },
    { data: participantsAll },
    { data: standingsRaw },
    { data: convRow },
    { data: canManageRaw, error: canManageError },
  ] = await Promise.all([
    getAuthUser(),
    supabase
      .from('championships')
      .select(
        `id, name, format, unit, status, start_date, end_date, allow_draw, has_third_place,
         is_official, description, venue_id,
         points_win, points_draw, points_loss, tiebreakers, created_at, created_by,
         venues(name),
         championship_stages(
           id, name, kind, counting, rounds,
           sets_to_play, points_per_set, win_by_two, set_draw_enabled, time_minutes,
           groups(id, name, ordering)
         )`,
      )
      .eq('id', id)
      .single(),
    supabase
      .from('matches')
      .select(
        `id, stage_id, round, bracket_slot, result, status, is_wo, is_double_wo,
         side_a_participant_id, side_b_participant_id,
         match_games(game_number, score_a, score_b)`,
      )
      .eq('championship_id', id)
      .order('round', { ascending: true })
      .order('created_at', { ascending: true }),
    // Confirmados e pendentes (inscrições do oficial) numa consulta só.
    supabase
      .from('participants')
      .select(`id, group_id, enrollment_status, participant_members(user_id)`)
      .eq('championship_id', id)
      .in('enrollment_status', ['confirmado', 'pendente']),
    supabase.rpc('get_standings', { _championship_id: id }),
    supabase
      .from('conversations')
      .select('id')
      .eq('championship_id', id)
      .eq('kind', 'group')
      .maybeSingle(),
    supabase.rpc('can_manage_championship', { _championship_id: id }),
  ])

  if (!champ) notFound()

  type StageRow = {
    id: string
    name: string
    kind: string
    counting: string
    rounds: number
    sets_to_play: number
    points_per_set: number
    win_by_two: boolean
    set_draw_enabled: boolean
    time_minutes: number | null
    groups?: { id: string; name: string; ordering: number }[] | null
  }
  const stages = (champ.championship_stages ?? []) as StageRow[]

  // Identifica fases por kind
  const gruposStageRaw   = stages.find((s) => s.kind === 'grupos')   ?? null
  const elimStageRaw     = stages.find((s) => s.kind === 'eliminatoria') ?? null
  const ligaStageRaw     = stages.find((s) => s.kind === 'liga')     ?? null

  // Para formatos single-stage (liga / eliminatória pura) usar o primeiro stage
  const primaryStageRaw  =
    champ.format === 'grupos_elim'
      ? gruposStageRaw
      : ligaStageRaw ?? elimStageRaw ?? stages[0] ?? null

  type ParticipantRow = {
    id: string
    group_id: string | null
    enrollment_status: string
    participant_members: { user_id: string }[] | null
  }
  const participantsRaw = ((participantsAll ?? []) as ParticipantRow[]).filter(
    (p) => p.enrollment_status === 'confirmado',
  )
  const isOfficial = (champ as { is_official?: boolean }).is_official ?? false
  const pendingRaw = isOfficial
    ? ((participantsAll ?? []) as ParticipantRow[]).filter((p) => p.enrollment_status === 'pendente')
    : []

  const memberIds = (rows: ParticipantRow[]) =>
    rows.flatMap((p) => (p.participant_members ?? []).map((m) => m.user_id))
  const allUserIds = memberIds(participantsRaw)
  const profileIds = [...new Set([...allUserIds, ...memberIds(pendingRaw)])]

  // ── 2ª rodada, em paralelo: o que depende da primeira ──────────────────────
  const [{ data: profiles }, groupStandingsRes] = await Promise.all([
    profileIds.length
      ? supabase.from('profiles').select('id, full_name, avatar_url').in('id', profileIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; avatar_url: string | null }[] }),
    champ.format === 'grupos_elim'
      ? supabase.rpc('get_group_standings', { _championship_id: id })
      : Promise.resolve(null),
  ])

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  // Monta mapa participantId → {full_name, avatar_url}
  const participantInfo: Record<string, { full_name: string | null; avatar_url: string | null }> = {}
  for (const p of participantsRaw) {
    const ids = (p.participant_members ?? []).map((m) => m.user_id)
    const names = ids.map((uid) => profileMap.get(uid)?.full_name).filter(Boolean) as string[]
    const avatarUrl = ids.length === 1 ? (profileMap.get(ids[0])?.avatar_url ?? null) : null
    participantInfo[p.id] = {
      full_name: names.length ? names.join(' / ') : null,
      avatar_url: avatarUrl,
    }
  }

  // ── participantGroups e grupos (apenas grupos_elim) ─────────────────────────
  const participantGroups: Record<string, string> = {}
  type GroupRow = { id: string; name: string }
  let groups: GroupRow[] = []
  if (champ.format === 'grupos_elim') {
    for (const p of participantsRaw) {
      if (p.group_id) participantGroups[p.id] = p.group_id
    }
    groups = [...(gruposStageRaw?.groups ?? [])]
      .sort((a, b) => a.ordering - b.ordering)
      .map((g) => ({ id: g.id, name: g.name }))
  }

  // ── ID do participante do usuário logado ────────────────────────────────────
  const currentUserParticipantId = user
    ? (participantsRaw.find((p) => (p.participant_members ?? []).some((m) => m.user_id === user.id))?.id ?? null)
    : null

  // ── Oficial: inscrições pendentes + status do usuário logado ────────────────
  type PendingEnroll = { participantId: string; name: string | null; avatarUrl: string | null; userId: string }
  const pendingEnrollments: PendingEnroll[] = pendingRaw.map((p) => {
    const uid = (p.participant_members ?? [])[0]?.user_id ?? ''
    const prof = profileMap.get(uid)
    return {
      participantId: p.id,
      userId: uid,
      name: prof?.full_name ?? null,
      avatarUrl: prof?.avatar_url ?? null,
    }
  })
  let myEnrollmentStatus: 'none' | 'pending' | 'confirmed' = 'none'
  if (isOfficial && user) {
    if (currentUserParticipantId) myEnrollmentStatus = 'confirmed'
    else if (pendingEnrollments.some((p) => p.userId === user.id)) myEnrollmentStatus = 'pending'
  }

  const confirmedCount = participantsRaw.length

  // ── Classificação inicial (geral e, em grupos_elim, só da fase de grupos) ───
  const initialStandings = (standingsRaw ?? []) as Standing[]
  const initialGroupStandings: Standing[] = groupStandingsRes
    ? ((groupStandingsRes.data ?? []) as Standing[])
    : initialStandings

  // ── Conversa de grupo do campeonato (só enquanto ativo) ─────────────────────
  const groupConversationId: string | null =
    champ.status === 'ativo' ? ((convRow as { id: string } | null)?.id ?? null) : null

  // ── Permissão de gestão ─────────────────────────────────────────────────────
  const canManage = user
    ? canManageError
      ? user.id === (champ.created_by ?? '')
      : ((canManageRaw as boolean) ?? false)
    : false

  // ── Normalização dos stages para serialização server → client ──────────────

  function normalizeStage(s: typeof primaryStageRaw) {
    if (!s) return null
    return {
      id: s.id,
      kind: s.kind,
      counting: s.counting as string,
      rounds: s.rounds ?? 1,
      sets_to_play: s.sets_to_play ?? 3,
      points_per_set: s.points_per_set ?? 11,
      win_by_two: s.win_by_two ?? true,
      set_draw_enabled: s.set_draw_enabled ?? false,
      time_minutes: s.time_minutes ?? null,
    }
  }

  return (
    <ChampionshipDetailClient
      champ={{
        id: champ.id,
        name: champ.name,
        format: champ.format,
        unit: champ.unit,
        status: champ.status,
        start_date: (champ as { start_date?: string | null }).start_date ?? null,
        end_date: (champ as { end_date?: string | null }).end_date ?? null,
        is_official: isOfficial,
        description: (champ as { description?: string | null }).description ?? null,
        venue_name: (() => {
          const v = (champ as { venues?: { name: string } | { name: string }[] | null }).venues
          if (!v) return null
          return Array.isArray(v) ? (v[0]?.name ?? null) : v.name
        })(),
        allow_draw: champ.allow_draw ?? false,
        has_third_place: (champ.has_third_place as boolean) ?? false,
        points_win: champ.points_win ?? 3,
        points_draw: champ.points_draw ?? 1,
        points_loss: champ.points_loss ?? 0,
        tiebreakers: (champ.tiebreakers as string[]) ?? [],
        created_by: champ.created_by ?? '',
      }}
      pendingEnrollments={pendingEnrollments}
      myEnrollmentStatus={myEnrollmentStatus}
      confirmedCount={confirmedCount}
      confirmedUserIds={[...new Set(allUserIds)]}
      stage={normalizeStage(primaryStageRaw)}
      elimStage={normalizeStage(elimStageRaw)}
      matches={(matchesRaw ?? []).map((m) => ({
        id: m.id,
        stage_id: (m as { stage_id?: string }).stage_id ?? '',
        round: m.round ?? 1,
        bracket_slot: (m.bracket_slot as number | null) ?? null,
        result: m.result ?? null,
        status: m.status,
        is_wo: (m as { is_wo?: boolean }).is_wo ?? false,
        is_double_wo: (m as { is_double_wo?: boolean }).is_double_wo ?? false,
        side_a_participant_id: m.side_a_participant_id ?? null,
        side_b_participant_id: m.side_b_participant_id ?? null,
        match_games: ((m.match_games as unknown as Array<{
          game_number: number
          score_a: number
          score_b: number
        }>) ?? []).map((g) => ({
          game_number: g.game_number,
          score_a: g.score_a,
          score_b: g.score_b,
        })),
      }))}
      participantInfo={participantInfo}
      canManage={canManage}
      initialStandings={initialStandings}
      initialGroupStandings={initialGroupStandings}
      currentUserParticipantId={currentUserParticipantId}
      groups={groups}
      participantGroups={participantGroups}
      groupConversationId={groupConversationId}
    />
  )
}
