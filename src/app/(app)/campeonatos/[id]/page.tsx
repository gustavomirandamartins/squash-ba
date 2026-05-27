import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { ChampionshipDetailClient } from '@/components/campeonatos/ChampionshipDetailClient'

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

  // ── 1. Campeonato + fase ──────────────────────────────────────
  const { data: champ } = await supabase
    .from('championships')
    .select(
      `id, name, format, unit, status, allow_draw,
       points_win, points_draw, points_loss, tiebreakers, created_at, created_by,
       championship_stages(
         id, name, kind, counting, rounds,
         sets_to_play, points_per_set, win_by_two, set_draw_enabled, time_minutes
       )`,
    )
    .eq('id', id)
    .single()

  if (!champ) notFound()

  // ── 2. Jogos + sets do campeonato ─────────────────────────────
  const { data: matchesRaw } = await supabase
    .from('matches')
    .select(
      `id, round, result, status,
       side_a_participant_id, side_b_participant_id,
       match_games(game_number, score_a, score_b)`,
    )
    .eq('championship_id', id)
    .order('round', { ascending: true })
    .order('created_at', { ascending: true })

  // ── 3. Participantes confirmados + seus membros ───────────────
  const { data: participantsRaw } = await supabase
    .from('participants')
    .select(`id, participant_members(user_id)`)
    .eq('championship_id', id)
    .eq('enrollment_status', 'confirmado')

  // ── 4. Perfis dos usuários (batch) ───────────────────────────
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
  const participantInfo: Record<
    string,
    { full_name: string | null; avatar_url: string | null }
  > = {}
  for (const p of participantsRaw ?? []) {
    const memberIds = (p.participant_members ?? []).map(
      (m: { user_id: string }) => m.user_id,
    )
    const names = memberIds
      .map((uid: string) => profileMap.get(uid)?.full_name)
      .filter(Boolean) as string[]
    const avatarUrl =
      memberIds.length === 1
        ? (profileMap.get(memberIds[0])?.avatar_url ?? null)
        : null
    participantInfo[p.id] = {
      full_name: names.length ? names.join(' / ') : null,
      avatar_url: avatarUrl,
    }
  }

  // ── 5. Permissão de gestão (server-side, security definer) ────
  // can_manage_championship: creator OU organizer/admin
  let canManage = false
  if (user) {
    try {
      const { data: ok } = await supabase.rpc('can_manage_championship', {
        _championship_id: id,
      })
      canManage = (ok as boolean) ?? false
    } catch {
      // Fallback conservador: só creator
      canManage = user.id === (champ.created_by ?? '')
    }
  }

  // ── Normalização para serialização server → client ─────────────
  const stage =
    champ.championship_stages && champ.championship_stages.length > 0
      ? champ.championship_stages[0]
      : null

  return (
    <ChampionshipDetailClient
      champ={{
        id: champ.id,
        name: champ.name,
        format: champ.format,
        unit: champ.unit,
        status: champ.status,
        allow_draw: champ.allow_draw ?? false,
        points_win: champ.points_win ?? 3,
        points_draw: champ.points_draw ?? 1,
        points_loss: champ.points_loss ?? 0,
        tiebreakers: (champ.tiebreakers as string[]) ?? [],
        created_by: champ.created_by ?? '',
      }}
      stage={
        stage
          ? {
              id: stage.id,
              counting: stage.counting as string,
              rounds: stage.rounds ?? 1,
              sets_to_play: stage.sets_to_play ?? 3,
              points_per_set: stage.points_per_set ?? 11,
              win_by_two: stage.win_by_two ?? true,
              set_draw_enabled: stage.set_draw_enabled ?? false,
              time_minutes: stage.time_minutes ?? null,
            }
          : null
      }
      matches={(matchesRaw ?? []).map((m) => ({
        id: m.id,
        round: m.round ?? 1,
        result: m.result ?? null,
        status: m.status,
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
    />
  )
}
