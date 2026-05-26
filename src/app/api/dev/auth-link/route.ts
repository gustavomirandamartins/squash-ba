// ROTA DE DESENVOLVIMENTO — gera magic link sem enviar e-mail.
// Só funciona em NODE_ENV=development. Em produção retorna 404.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse(null, { status: 404 })
  }

  const url = new URL(request.url)
  const email = url.searchParams.get('email')

  if (!email) {
    return NextResponse.json(
      { error: 'Parâmetro "email" é obrigatório. Ex: /api/dev/auth-link?email=seu@email.com' },
      { status: 400 }
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !secretKey) {
    return NextResponse.json(
      { error: 'SUPABASE_SECRET_KEY não configurada no .env.local' },
      { status: 500 }
    )
  }

  // Admin client — usa service key, nunca exposta ao browser, só server-side.
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let { data, error } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  // Se o usuário ainda não existe, cria já confirmado (dispara handle_new_user:
  // profile + profiles_private + papel player) e tenta gerar o link de novo.
  if (error) {
    const { error: createErr } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
    })
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 })
    }
    ;({ data, error } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
    }))
  }

  if (error || !data?.properties) {
    return NextResponse.json(
      { error: error?.message ?? 'Falha ao gerar link.' },
      { status: 500 }
    )
  }

  // Em vez do action_link (que passa pelo /verify do Supabase e devolve os
  // tokens no fragmento de hash — ilegível pelo servidor), usamos o hashed_token
  // direto no nosso callback. Esse é o fluxo SSR correto: verifyOtp server-side.
  const callbackUrl = new URL(`${url.origin}/auth/callback`)
  callbackUrl.searchParams.set('token_hash', data.properties.hashed_token)
  callbackUrl.searchParams.set('type', 'magiclink')
  return NextResponse.redirect(callbackUrl.toString())
}
