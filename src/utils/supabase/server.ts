import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components não podem setar cookies — ignorado.
          }
        },
      },
    }
  )
}

export type AuthUser = { id: string; email: string | null }

/**
 * Usuário autenticado para Server Components (páginas e layouts).
 *
 * Usa getClaims(): verifica a assinatura do JWT localmente (chaves assimétricas
 * do Supabase) em vez de consultar o servidor de Auth a cada request como o
 * getUser() — cada consulta era uma ida e volta a mais em toda navegação.
 * Sem chaves assimétricas, o próprio getClaims() cai para a validação no Auth.
 * `cache` garante uma única verificação por request, mesmo se layout e página
 * chamarem. Server actions e rotas de API seguem com getUser() (gravam dados).
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return null
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null }
})
