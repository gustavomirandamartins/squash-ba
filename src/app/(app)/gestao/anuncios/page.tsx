import { notFound } from 'next/navigation'
import { createClient, getAuthUser } from '@/utils/supabase/server'
import { AdForm } from './AdForm'
import { AdList } from './AdList'

export const metadata = { title: 'Anúncios' }

export default async function AnunciosPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) notFound()

  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id)
  if (!(roles ?? []).some((r) => r.role === 'admin')) notFound()

  const { data: ads } = await supabase
    .from('ads')
    .select('id, name, product_service, phone, email, address, active, ordering')
    .order('ordering', { ascending: true })
    .order('created_at', { ascending: true })

  return (
    <div className="px-5 py-4 space-y-6">
      <h1 className="font-display text-xl font-extrabold text-white">Anúncios</h1>

      {/* Formulário de criação */}
      <AdForm />

      {/* Lista de anúncios existentes */}
      <AdList ads={(ads ?? []) as AdRow[]} />
    </div>
  )
}

export type AdRow = {
  id: string
  name: string
  product_service: string
  phone: string | null
  email: string | null
  address: string | null
  active: boolean
  ordering: number
}
