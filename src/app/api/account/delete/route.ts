// Exclusão da própria conta (LGPD: direito de exclusão).
// Fluxo: valida a sessão server-side (getUser, nunca getSession), pega o
// user.id autenticado e usa o Admin client (service key, server-only) para
// deletar APENAS esse usuário. O delete em auth.users cascateia para
// profiles / profiles_private / user_roles / organizer_requests (FK on delete cascade).
import { createClient as createServerSupabase } from '@/utils/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createServerSupabase()

  // Quem está pedindo? getUser() valida o JWT de verdade.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !secretKey) {
    return NextResponse.json(
      { error: 'Configuração do servidor incompleta.' },
      { status: 500 }
    )
  }

  // Admin client só no servidor — a service key nunca chega ao browser.
  const admin = createAdminSupabase(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Deleta SOMENTE o usuário autenticado (nunca um id vindo do cliente).
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Encerra a sessão local (limpa cookies).
  await supabase.auth.signOut()

  return NextResponse.json({ ok: true })
}
