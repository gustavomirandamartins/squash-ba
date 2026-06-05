'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export type AdResult = { ok: true } | { error: string }

async function isAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').single()
  return !!data
}

export async function createAd(_prev: AdResult | null, formData: FormData): Promise<AdResult> {
  if (!(await isAdmin())) return { error: 'Não autorizado.' }
  const supabase = await createClient()

  const name            = (formData.get('name') as string)?.trim()
  const product_service = (formData.get('product_service') as string)?.trim()
  const phone           = (formData.get('phone') as string)?.trim() || null
  const email           = (formData.get('email') as string)?.trim() || null
  const address         = (formData.get('address') as string)?.trim() || null

  if (!name || !product_service) return { error: 'Nome e produto/serviço são obrigatórios.' }

  const { error } = await supabase.from('ads').insert({ name, product_service, phone, email, address })
  if (error) return { error: error.message }

  revalidatePath('/gestao/anuncios')
  revalidatePath('/admin/anuncios')
  revalidatePath('/marketplace')
  return { ok: true }
}

export async function toggleAd(id: string, active: boolean): Promise<void> {
  if (!(await isAdmin())) return
  const supabase = await createClient()
  await supabase.from('ads').update({ active }).eq('id', id)
  revalidatePath('/gestao/anuncios')
  revalidatePath('/admin/anuncios')
  revalidatePath('/marketplace')
}

export async function deleteAd(id: string): Promise<void> {
  if (!(await isAdmin())) return
  const supabase = await createClient()
  await supabase.from('ads').delete().eq('id', id)
  revalidatePath('/gestao/anuncios')
  revalidatePath('/admin/anuncios')
  revalidatePath('/marketplace')
}

export async function updateAd(id: string, _prev: AdResult | null, formData: FormData): Promise<AdResult> {
  if (!(await isAdmin())) return { error: 'Não autorizado.' }
  const supabase = await createClient()

  const name            = (formData.get('name') as string)?.trim()
  const product_service = (formData.get('product_service') as string)?.trim()
  const phone           = (formData.get('phone') as string)?.trim() || null
  const email           = (formData.get('email') as string)?.trim() || null
  const address         = (formData.get('address') as string)?.trim() || null
  const ordering        = parseInt(formData.get('ordering') as string, 10) || 0

  if (!name || !product_service) return { error: 'Nome e produto/serviço são obrigatórios.' }

  const { error } = await supabase.from('ads').update({ name, product_service, phone, email, address, ordering }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/gestao/anuncios')
  revalidatePath('/admin/anuncios')
  revalidatePath('/marketplace')
  return { ok: true }
}
