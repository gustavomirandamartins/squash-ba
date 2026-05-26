import { createClient } from '@/utils/supabase/server'
import { TeamList } from '@/components/gestao/TeamList'

export const metadata = { title: 'Times · Gestão' }

export default async function TimesPage() {
  const supabase = await createClient()

  const [{ data: teams }, { data: venues }] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, address, has_own_venue, home_venue_id')
      .order('name'),
    supabase.from('venues').select('id, name').order('name'),
  ])

  return (
    <div className="px-5 py-4">
      <TeamList initialTeams={teams ?? []} venues={venues ?? []} />
    </div>
  )
}
