import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

/**
 * proxy.ts — Next.js 16 (substitui middleware.ts).
 *
 * Responsabilidade única: renovar o token de sessão do Supabase a cada request,
 * para que Server Components sempre recebam um JWT válido via cookies.
 * NÃO é usado para proteção de rotas — cada page/layout faz seu próprio getUser().
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // 1. Propaga cookies novos para o request (Server Components nesta request)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          // 2. Recria response com o request atualizado
          response = NextResponse.next({ request })
          // 3. Seta cookies no response (browser recebe Set-Cookie)
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Valida e renova a sessão. getClaims() renova o token se expirou e verifica
  // a assinatura do JWT localmente (chaves assimétricas), sem a ida ao servidor
  // de Auth que o getUser() fazia em TODO request. Nunca getSession() aqui.
  await supabase.auth.getClaims()

  return response
}

export const config = {
  matcher: [
    // Roda em todas as rotas exceto assets estáticos e _next internals
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)',
  ],
}
