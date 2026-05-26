import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { VenueDetail } from '@/components/gestao/VenueDetail'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('venues')
    .select('name')
    .eq('id', id)
    .single()
  return { title: data ? `${data.name} · Locais` : 'Local · Gestão' }
}

export default async function VenuePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: venue }, { data: courts }] = await Promise.all([
    supabase
      .from('venues')
      .select('id, name, address')
      .eq('id', id)
      .single(),
    supabase
      .from('courts')
      .select('id, name')
      .eq('venue_id', id)
      .order('name'),
  ])

  if (!venue) notFound()

  return (
    <div className="px-5 py-4">
      <VenueDetail venue={venue} initialCourts={courts ?? []} />
    </div>
  )
}
