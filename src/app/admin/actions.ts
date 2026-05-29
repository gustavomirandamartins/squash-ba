'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function approveRequest(targetUserId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_organizer_request', {
    target_user_id: targetUserId,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function rejectRequest(targetUserId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_organizer_request', {
    target_user_id: targetUserId,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

// Define/atualiza o link de destino de um banner do patrocinador.
// A imagem é subida manualmente no Storage; aqui o admin associa o link.
export async function saveBannerLink(formData: FormData) {
  const imageName = String(formData.get('image_name') ?? '')
  const linkUrl = String(formData.get('link_url') ?? '').trim()
  if (!imageName) return

  const supabase = await createClient()
  const { error } = await supabase.from('sponsor_banners').upsert({
    image_name: imageName,
    link_url: linkUrl || null,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
  revalidatePath('/')
}
