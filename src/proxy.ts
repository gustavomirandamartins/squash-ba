import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

/**
 * proxy.ts — Next.js 16 (substitui middleware.ts).
 *
 * 1. Renova o token de sessão do Supabase a cada request, para que Server
 *    Components sempre recebam um JWT válido via cookies.
 * 2. Visitante sem sessão que abre uma tela do app vai para /login (com
 *    ?next= para voltar depois) ANTES de qualquer renderização. Sem isso,
 *    layout e página renderizavam em paralelo e a página já consultava o banco
 *    como anônimo enquanto o layout redirecionava.
 *
 * Os layouts e páginas continuam conferindo a sessão (getUser) — o proxy é a
 * primeira barreira, não a única. As rotas de /api fazem a própria checagem
 * (sessão, CRON_SECRET do keep-alive, modo de desenvolvimento).
 *
 * Offline não passa por aqui: sem rede, quem responde é o service worker
 * (cópias guardadas e o shell /~offline).
 */

// Abertas sem sessão. Cada item vale para o caminho e o que vem abaixo dele.
const PUBLIC_PREFIXES = [
  '/login',
  '/auth', // callback do link mágico / confirmação de e-mail
  '/api', // cada rota confere o próprio acesso
  '/privacidade',
  '/~offline', // shell offline (precache do service worker)
]
// Abertas só no caminho exato: /termos é pública, /termos/aceitar exige sessão.
const PUBLIC_EXACT = ['/termos']

function isPublic(path: string): boolean {
  if (PUBLIC_EXACT.includes(path)) return true
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
}

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
  const { data } = await supabase.auth.getClaims()
  const hasSession = !!data?.claims?.sub

  const path = request.nextUrl.pathname
  if (!hasSession && !isPublic(path)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    if (path !== '/') url.searchParams.set('next', path + request.nextUrl.search)
    const redirect = NextResponse.redirect(url)
    // Mantém cookies que a renovação tenha limpado (sessão expirada).
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  return response
}

export const config = {
  matcher: [
    // Fora: internos do Next, service worker e arquivos do Serwist, manifest,
    // ícones e imagens.
    '/((?!_next/static|_next/image|serwist/|favicon.ico|icons/|brand/|manifest.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
}
