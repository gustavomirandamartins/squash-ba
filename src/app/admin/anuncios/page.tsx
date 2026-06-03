import { createClient } from '@/utils/supabase/server'
import { AdForm } from '@/app/(app)/gestao/anuncios/AdForm'
import { AdList } from '@/app/(app)/gestao/anuncios/AdList'
import type { AdRow } from '@/app/(app)/gestao/anuncios/page'
import { Megaphone } from 'lucide-react'

export const metadata = { title: 'Anúncios — Admin' }

export default async function AdminAnunciosPage() {
  const supabase = await createClient()

  const { data: ads } = await supabase
    .from('ads')
    .select('id, name, product_service, phone, email, address, active, ordering')
    .order('ordering', { ascending: true })
    .order('created_at', { ascending: true })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-white/40" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
          Marketplace — Anúncios
        </h2>
      </div>

      <AdForm />
      <AdList ads={(ads ?? []) as AdRow[]} />
    </div>
  )
}
