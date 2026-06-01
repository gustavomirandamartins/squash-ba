'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export type FeedbackResult = { ok: true } | { error: string }

export async function submitFeedback(
  _prev: FeedbackResult | null,
  formData: FormData,
): Promise<FeedbackResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Usuário não autenticado.' }

  const message = (formData.get('message') as string | null)?.trim() ?? ''
  const type    = (formData.get('type')    as string | null) ?? 'geral'

  if (message.length < 5)    return { error: 'Mensagem muito curta (mínimo 5 caracteres).' }
  if (message.length > 1000) return { error: 'Mensagem muito longa (máximo 1000 caracteres).' }

  const validTypes = ['bug', 'sugestao', 'critica', 'geral']
  if (!validTypes.includes(type)) return { error: 'Tipo inválido.' }

  // Busca nome do perfil para mostrar no painel admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const { error } = await supabase.from('feedback').insert({
    user_id:   user.id,
    user_name: profile?.full_name ?? null,
    message,
    type,
  })

  if (error) return { error: 'Erro ao enviar. Tente novamente.' }

  revalidatePath('/gestao/feedbacks')
  return { ok: true }
}
