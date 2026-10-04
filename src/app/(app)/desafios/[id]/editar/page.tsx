import { notFound } from 'next/navigation'
import { createClient, getAuthUser } from '@/utils/supabase/server'
import { EditChallengeForm } from '@/components/desafios/EditChallengeForm'

export const metadata = { title: 'Editar desafio' }

export default async function EditChallengePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const user = await getAuthUser()
  if (!user) notFound()

  const { data: champ } = await supabase
    .from('championships')
    .select('id, name, status, championship_stages(id, rounds)')
    .eq('id', id)
    .eq('format', 'desafio')
    .single()

  if (!champ) notFound()

  const { data: canManage } = await supabase.rpc('can_manage_championship', { _championship_id: id })
  if (!canManage) notFound()

  const stage = (champ.championship_stages ?? [])[0] as { id: string; rounds: number } | undefined

  return (
    <EditChallengeForm
      challenge={{ id: champ.id, name: champ.name, status: champ.status }}
      stageId={stage?.id ?? null}
      rounds={stage?.rounds ?? 1}
    />
  )
}
