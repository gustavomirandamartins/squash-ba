import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { EditChampionshipForm } from '@/components/campeonatos/EditChampionshipForm'

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
      `id, name, status, start_date, allow_draw, points_win, points_draw, points_loss,
       championship_stages(id, kind, sets_to_play, points_per_set, win_by_two)`,
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
    sets_to_play: number
    points_per_set: number
    win_by_two: boolean
  }>
  // Fase primária: grupos (grupos_elim) ou a primeira disponível
  const primary = stages.find((s) => s.kind === 'grupos') ?? stages.find((s) => s.kind === 'liga') ?? stages[0] ?? null

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
