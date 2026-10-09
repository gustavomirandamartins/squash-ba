// Regras de senha do app. O Supabase Auth também exige o mínimo (painel:
// Authentication → Sign In / Providers → Email → Minimum password length);
// aqui o app avisa antes de enviar e traduz as recusas do servidor.

/** Mínimo para CRIAR ou TROCAR a senha. Para entrar não vale: contas antigas
 *  têm senhas de 6 ou 7 caracteres e continuam entrando normalmente. */
export const MIN_PASSWORD_LENGTH = 8

export const PASSWORD_HINT = `Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.`

export const isPasswordLongEnough = (password: string) => password.length >= MIN_PASSWORD_LENGTH

/** Mensagem em português para a recusa de senha do Supabase, ou null se não for de senha. */
export function translatePasswordError(message: string): string | null {
  const m = message.toLowerCase()
  const min = m.match(/at least (\d+) characters/)
  if (min) return `A senha precisa de pelo menos ${min[1]} caracteres.`
  if (m.includes('pwned') || m.includes('leaked') || m.includes('known to be weak') || m.includes('weak password')) {
    return 'Esta senha é fraca ou já apareceu em vazamentos. Escolha outra.'
  }
  if (m.includes('should contain') || m.includes('characters of each')) {
    return 'A senha precisa misturar letras e números.'
  }
  if (m.includes('should be different')) return 'A nova senha precisa ser diferente da atual.'
  return null
}
