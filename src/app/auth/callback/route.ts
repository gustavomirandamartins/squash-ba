import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const next = searchParams.get('next') ?? '/'

  // Cria a resposta de redirect antecipadamente para poder setar cookies nela.
  // Padrão correto para Next.js 15: ler cookies de request.cookies e escrever
  // diretamente no objeto response — garantindo que os Set-Cookie headers
  // estejam no mesmo response retornado ao browser.
  const successResponse = NextResponse.redirect(`${origin}${next}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            successResponse.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  // Fluxo PKCE (magic link / OAuth — callback recebe ?code=xxx)
  const code = searchParams.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return successResponse
  }

  // Fluxo OTP (magic link sem PKCE — callback recebe ?token_hash=xxx&type=magiclink)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return successResponse
  }

  // Nenhum parâmetro válido ou verificação falhou
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
