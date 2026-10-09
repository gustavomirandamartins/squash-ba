'use server'

import { createClient } from '@/utils/supabase/server'
import { MIN_PASSWORD_LENGTH, isPasswordLongEnough, translatePasswordError } from '@/lib/auth/password'

/**
 * Atualiza a senha do usuário autenticado (sessão de recovery).
 * Roda no servidor para ter acesso pleno aos cookies de sessão,
 * evitando problemas de sincronização com o browser client.
 */
export async function updatePasswordAction(
  password: string,
): Promise<{ error: string | null }> {
  if (!password || !isPasswordLongEnough(password)) {
    return { error: `A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` }
  }

  const supabase = await createClient()

  // Verifica sessão server-side (mais confiável que getSession() client-side)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Sessão expirada ou inválida. Solicite um novo link de redefinição.' }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: translatePasswordError(error.message) ?? error.message }

  return { error: null }
}
