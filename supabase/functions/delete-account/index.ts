/**
 * delete-account — exclusão da própria conta (LGPD), para o app iOS.
 *
 * Mesmo comportamento de /api/account/delete no web:
 *   1. o gateway confere a assinatura do token (verify_jwt = true);
 *   2. aqui o token é validado de novo no Auth (getUser) e dá o id do usuário;
 *   3. o cliente de serviço exclui SOMENTE esse usuário — nunca um id vindo
 *      do corpo da requisição. O delete em auth.users cascateia para profiles,
 *      profiles_private, user_roles etc.
 *
 * Chamada: POST com Authorization: Bearer <access_token do usuário>.
 * Resposta: { ok: true } | { error } (401 sem sessão válida, 500 em falha).
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Não autenticado.' }, 401)

  // Quem está pedindo? getUser valida o token no Auth (um token de serviço
  // ou anônimo não tem usuário e cai aqui).
  const auth = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user }, error: userError } = await auth.auth.getUser(token)
  if (userError || !user) return json({ error: 'Não autenticado.' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) return json({ error: error.message }, 500)

  return json({ ok: true })
})
