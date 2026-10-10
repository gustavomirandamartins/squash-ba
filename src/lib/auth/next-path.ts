// Para onde voltar depois do login (?next=). Só caminhos internos do app:
// começa com "/" e não com "//" ou "/\" (que o navegador trataria como outro
// site). /login e o próprio fluxo de autenticação não contam.

/** Cookie com o destino depois do link mágico (lido pelo /auth/callback). */
export const LOGIN_NEXT_COOKIE = 'sb-login-next'

export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  let path: string
  try {
    path = decodeURIComponent(raw)
  } catch {
    return null
  }
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return null
  if (path === '/login' || path.startsWith('/login?') || path.startsWith('/login/')) return null
  if (path.startsWith('/auth/')) return null
  return path
}
