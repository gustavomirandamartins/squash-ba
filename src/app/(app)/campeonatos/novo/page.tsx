import { createClient } from '@/utils/supabase/server'
import { ChampionshipWizard } from '@/components/campeonatos/ChampionshipWizard'

export const metadata = { title: 'Novo campeonato' }

export default async function NovoCampeonatoPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Papel: só admin/professor pode criar campeonato oficial.
  let canCreateOfficial = false
  if (user) {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
    const set = new Set((roles ?? []).map((r) => r.role as string))
    canCreateOfficial = set.has('admin') || set.has('organizer')
  }

  // Locais para o seletor (disponível para todos os campeonatos).
  const { data: venues } = user
    ? await supabase.from('venues').select('id, name').order('name')
    : { data: [] }

  return (
    <ChampionshipWizard
      venues={(venues ?? []) as { id: string; name: string }[]}
      canCreateOfficial={canCreateOfficial}
    />
  )
}
