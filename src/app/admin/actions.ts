'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

type AdminCtx =
  | { ok: true; userId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }

// Garante que o requisitante é admin.
async function requireAdmin(): Promise<AdminCtx> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado.' }
  const { data: role } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()
  if (!role) return { ok: false, error: 'Acesso restrito ao admin.' }
  return { ok: true, userId: user.id, supabase }
}

// Remove o papel de professor (organizer) de um usuário.
export async function revokeOrganizer(targetUserId: string): Promise<{ error: string | null }> {
  const ctx = await requireAdmin()
  if (!ctx.ok) return { error: ctx.error }
  const { error } = await ctx.supabase.rpc('revoke_organizer_role', { target_user_id: targetUserId })
  if (error) return { error: error.message }
  revalidatePath('/admin', 'layout')
  revalidatePath('/')
  return { error: null }
}

// Exclui um usuário cadastrado (auth.users → cascateia profiles/roles/etc).
// Usa o Admin client (service key, server-only). Bloqueia auto-exclusão e
// exclusão de outros admins.
export async function deleteUser(targetUserId: string): Promise<{ error: string | null }> {
  const ctx = await requireAdmin()
  if (!ctx.ok) return { error: ctx.error }
  if (targetUserId === ctx.userId) return { error: 'Você não pode excluir a si mesmo.' }

  // Não permite excluir outro admin.
  const { data: targetAdmin } = await ctx.supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', targetUserId)
    .eq('role', 'admin')
    .maybeSingle()
  if (targetAdmin) return { error: 'Não é possível excluir um administrador.' }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !secretKey) return { error: 'Configuração do servidor incompleta.' }

  const admin = createAdminSupabase(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await admin.auth.admin.deleteUser(targetUserId)
  if (error) return { error: error.message }

  revalidatePath('/admin', 'layout')
  return { error: null }
}

export async function approveRequest(targetUserId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_organizer_request', {
    target_user_id: targetUserId,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin', 'layout')
}

export async function rejectRequest(targetUserId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_organizer_request', {
    target_user_id: targetUserId,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin', 'layout')
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
  revalidatePath('/admin', 'layout')
  revalidatePath('/')
}
