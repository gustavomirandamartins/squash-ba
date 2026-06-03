import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
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

  // getUser() — nunca getSession() server-side (valida JWT)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ── 1. Campeonato + fases ─────────────────────────────────────────────────
  const { data: champ } = await supabase
    .from('championships')
    .select(
      `id, name, format, unit, status, start_date, allow_draw, has_third_place,
       points_win, points_draw, points_loss, tiebreakers, created_at, created_by,
       championship_stages(
         id, name, kind, counting, rounds,
         sets_to_play, points_per_set, win_by_two, set_draw_enabled, time_minutes
       )`,
    )
    .eq('id', id)
    .single()

  if (!champ) notFound()

  const stages = (champ.championship_stages ?? []) as Array<{
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
  }>

  // Identifica fases por kind
  const gruposStageRaw   = stages.find((s) => s.kind === 'grupos')   ?? null
  const elimStageRaw     = stages.find((s) => s.kind === 'eliminatoria') ?? null
  const ligaStageRaw     = stages.find((s) => s.kind === 'liga')     ?? null

  // Para formatos single-stage (liga / eliminatória pura) usar o primeiro stage
  const primaryStageRaw  =
    champ.format === 'grupos_elim'
      ? gruposStageRaw
      : ligaStageRaw ?? elimStageRaw ?? stages[0] ?? null

  // ── 2. Jogos + sets do campeonato (com stage_id) ──────────────────────────
  const { data: matchesRaw } = await supabase
    .from('matches')
    .select(
      `id, stage_id, round, bracket_slot, result, status, is_wo,
       side_a_participant_id, side_b_participant_id,
       match_games(game_number, score_a, score_b)`,
    )
    .eq('championship_id', id)
    .order('round', { ascending: true })
    .order('created_at', { ascending: true })

  // ── 3. Participantes confirmados + membros + group_id ─────────────────────
  const { data: participantsRaw } = await supabase
    .from('participants')
    .select(`id, group_id, participant_members(user_id)`)
    .eq('championship_id', id)
    .eq('enrollment_status', 'confirmado')

  // ── 4. Perfis dos usuários (batch) ────────────────────────────────────────
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

  // Monta mapa participantId → {full_name, avatar_url}
  const participantInfo: Record<string, { full_name: string | null; avatar_url: string | null }> = {}
  for (const p of participantsRaw ?? []) {
    const memberIds = (p.participant_members ?? []).map((m: { user_id: string }) => m.user_id)
    const names = memberIds
      .map((uid: string) => profileMap.get(uid)?.full_name)
      .filter(Boolean) as string[]
    const avatarUrl =
      memberIds.length === 1 ? (profileMap.get(memberIds[0])?.avatar_url ?? null) : null
    participantInfo[p.id] = {
      full_name: names.length ? names.join(' / ') : null,
      avatar_url: avatarUrl,
    }
  }

  // ── 5. participantGroups (apenas grupos_elim) ─────────────────────────────
  const participantGroups: Record<string, string> = {}
  if (champ.format === 'grupos_elim') {
    for (const p of participantsRaw ?? []) {
      const gid = (p as { group_id?: string | null }).group_id
      if (gid) participantGroups[p.id] = gid
    }
  }

  // ── 6. Grupos (apenas grupos_elim) ────────────────────────────────────────
  type GroupRow = { id: string; name: string }
  let groups: GroupRow[] = []

  if (champ.format === 'grupos_elim' && gruposStageRaw) {
    const { data: groupsRaw } = await supabase
      .from('groups')
      .select('id, name, ordering')
      .eq('stage_id', gruposStageRaw.id)
      .order('ordering', { ascending: true })
    groups = (groupsRaw ?? []).map((g) => ({ id: g.id, name: g.name }))
  }

  // ── 7. ID do participante do usuário logado ────────────────────────────────
  const currentUserParticipantId =
    user && participantsRaw
      ? (participantsRaw.find((p) =>
          (p.participant_members ?? []).some(
            (m: { user_id: string }) => m.user_id === user.id,
          ),
        )?.id ?? null)
      : null

  // ── 8. Classificação inicial via RPC (SSR) ────────────────────────────────
  const { data: standingsRaw } = await supabase.rpc('get_standings', {
    _championship_id: id,
  })
  const initialStandings = (standingsRaw ?? []) as Standing[]

  // Classificação da fase de GRUPOS (escopada — não soma a eliminatória, fix #13).
  let initialGroupStandings: Standing[] = initialStandings
  if (champ.format === 'grupos_elim') {
    const { data: groupStandingsRaw } = await supabase.rpc('get_group_standings', {
      _championship_id: id,
    })
    initialGroupStandings = (groupStandingsRaw ?? []) as Standing[]
  }

  // ── 9. Conversa de grupo do campeonato ───────────────────────────────────
  let groupConversationId: string | null = null
  if (champ.status === 'ativo') {
    const { data: convRow } = await supabase
      .from('conversations')
      .select('id')
      .eq('championship_id', id)
      .eq('kind', 'group')
      .single()
    groupConversationId = convRow?.id ?? null
  }

  // ── 11. Permissão de gestão ───────────────────────────────────────────────
  let canManage = false
  if (user) {
    try {
      const { data: ok } = await supabase.rpc('can_manage_championship', {
        _championship_id: id,
      })
      canManage = (ok as boolean) ?? false
    } catch {
      canManage = user.id === (champ.created_by ?? '')
    }
  }

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
        allow_draw: champ.allow_draw ?? false,
        has_third_place: (champ.has_third_place as boolean) ?? false,
        points_win: champ.points_win ?? 3,
        points_draw: champ.points_draw ?? 1,
        points_loss: champ.points_loss ?? 0,
        tiebreakers: (champ.tiebreakers as string[]) ?? [],
        created_by: champ.created_by ?? '',
      }}
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
