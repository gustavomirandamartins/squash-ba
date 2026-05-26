import { createClient } from '@/utils/supabase/server'
import { VenueList } from '@/components/gestao/VenueList'

export const metadata = { title: 'Locais · Gestão' }

export default async function LocaisPage() {
  const supabase = await createClient()
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, address, courts(id)')
    .order('name')

  return (
    <div className="px-5 py-4">
      <VenueList initialVenues={venues ?? []} />
    </div>
  )
}
