// Rota acionada pelo Vercel Cron para manter o banco ativo e o projeto no ar.
// Em produção, a Vercel injeta automaticamente Authorization: Bearer <CRON_SECRET>.
// Em desenvolvimento, chame manualmente: GET /api/keep-alive com o mesmo header.
import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  // Proteção por CRON_SECRET — obrigatória se a variável estiver definida.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !publishableKey) {
    return NextResponse.json(
      { error: 'Supabase env vars missing' },
      { status: 500 },
    )
  }

  // Query trivial: apenas verifica conectividade; não depende de RLS.
  const supabase = createSupabaseClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { count, error } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, profiles: count, ts: new Date().toISOString() })
}
