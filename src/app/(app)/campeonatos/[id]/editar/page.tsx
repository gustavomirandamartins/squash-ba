import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { EditChampionshipForm } from '@/components/campeonatos/EditChampionshipForm'
import { EditOfficialForm } from '@/components/campeonatos/EditOfficialForm'

export const metadata = { title: 'Editar campeonato' }

export default async function EditChampionshipPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: champ } = await supabase
    .from('championships')
    .select(
      `id, name, format, status, is_official, description, venue_id,
       start_date, end_date, allow_draw, has_third_place,
       points_win, points_draw, points_loss,
       championship_stages(id, kind, counting, rounds, sets_to_play,
         points_per_set, win_by_two, set_draw_enabled, time_minutes, ordering)`,
    )
    .eq('id', id)
    .neq('format', 'desafio')
    .single()

  if (!champ) notFound()

  // Permissão de gestão (mesmo gate da tela de detalhe)
  const { data: canManage } = await supabase.rpc('can_manage_championship', { _championship_id: id })
  if (!canManage) notFound()

  const stages = (champ.championship_stages ?? []) as Array<{
    id: string
    kind: string
    counting: string
    rounds: number
    sets_to_play: number
    points_per_set: number
    win_by_two: boolean
    set_draw_enabled: boolean
    time_minutes: number | null
    ordering: number
  }>

  // ── Campeonato oficial em rascunho → editor completo ──────────────────────
  if (champ.is_official && champ.status === 'rascunho') {
    let numGroups = 2
    const gruposStage = stages.find((s) => s.kind === 'grupos')
    if (champ.format === 'grupos_elim' && gruposStage) {
      const { count } = await supabase
        .from('groups')
        .select('id', { count: 'exact', head: true })
        .eq('stage_id', gruposStage.id)
      numGroups = count ?? 2
    }

    const orderedStages = stages
      .slice()
      .sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
      .map((s) => ({
        id: s.id,
        kind: s.kind,
        counting: (s.counting as 'set' | 'tempo') ?? 'set',
        rounds: s.rounds ?? 1,
        setsToPlay: s.sets_to_play ?? 3,
        pointsPerSet: s.points_per_set ?? 11,
        winByTwo: s.win_by_two ?? true,
        setDrawEnabled: s.set_draw_enabled ?? false,
        timeMinutes: s.time_minutes ?? null,
      }))

    const { data: venues } = await supabase.from('venues').select('id, name').order('name')

    return (
      <EditOfficialForm
        champ={{
          id: champ.id,
          name: champ.name,
          format: champ.format,
          description: (champ as { description?: string | null }).description ?? null,
          venue_id: (champ as { venue_id?: string | null }).venue_id ?? null,
          start_date: (champ as { start_date?: string | null }).start_date ?? null,
          end_date: (champ as { end_date?: string | null }).end_date ?? null,
          points_win: champ.points_win ?? 3,
          points_draw: champ.points_draw ?? 1,
          points_loss: champ.points_loss ?? 0,
          allow_draw: champ.allow_draw ?? false,
          has_third_place: champ.has_third_place ?? false,
          num_groups: numGroups,
        }}
        stages={orderedStages}
        venues={(venues ?? []) as { id: string; name: string }[]}
      />
    )
  }

  // ── Demais campeonatos → editor simples existente ─────────────────────────
  const primary =
    stages.find((s) => s.kind === 'grupos') ?? stages.find((s) => s.kind === 'liga') ?? stages[0] ?? null

  return (
    <EditChampionshipForm
      champ={{
        id: champ.id,
        name: champ.name,
        status: champ.status,
        start_date: (champ as { start_date?: string | null }).start_date ?? null,
        allow_draw: champ.allow_draw ?? false,
        points_win: champ.points_win ?? 3,
        points_draw: champ.points_draw ?? 1,
        points_loss: champ.points_loss ?? 0,
      }}
      stage={
        primary
          ? {
              id: primary.id,
              sets_to_play: primary.sets_to_play ?? 3,
              points_per_set: primary.points_per_set ?? 11,
              win_by_two: primary.win_by_two ?? true,
            }
          : null
      }
    />
  )
}
