/**
 * notify-push — Edge Function genérica de Web Push.
 *
 * Disparada via Database Webhook em public.notifications (INSERT).
 * Envia uma Web Push para todas as subscriptions do destinatário (user_id) e,
 * pelo APNs, para os iPhones dele com o app (push_devices; ver _shared/apns.ts).
 *
 * Mensagens (type='mensagem') são IGNORADAS aqui: elas já têm push próprio via
 * a função send-push (webhook em public.messages), evitando push duplicado.
 *
 * Configuração (uma vez, no dashboard): Database Webhooks → criar webhook em
 * `public.notifications` evento INSERT → HTTP POST para esta função.
 */

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendApns } from '../_shared/apns.ts'

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT')     ?? 'mailto:contato@gustavomartins.com'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/**
 * Só o banco (webhook com a chave de serviço) pode disparar push. O gateway já
 * confere a assinatura do token (verify_jwt); aqui conferimos o PAPEL — sem
 * isso, qualquer usuário logado (cujo token também é válido) podia mandar push
 * com título, texto e link livres para qualquer pessoa.
 */
function isServiceRole(req: Request): boolean {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const part = token.split('.')[1]
  if (!part) return false
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')))
    return claims?.role === 'service_role'
  } catch {
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (!isServiceRole(req)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })
  }
  try {
    const body = await req.json() as {
      record: {
        id: string
        user_id: string
        type: string
        title: string
        body: string | null
        url: string | null
      }
    }

    const { record } = body
    if (!record?.user_id) {
      return new Response(JSON.stringify({ sent: 0, skipped: 'no user' }), { status: 200 })
    }
    // Mensagens já têm push próprio (send-push) — evita duplicação.
    if (record.type === 'mensagem') {
      return new Response(JSON.stringify({ sent: 0, skipped: 'message' }), { status: 200 })
    }

    console.log(`[notify-push] type=${record.type} user=${record.user_id}`)

    // App iOS (APNs) — à parte do Web Push abaixo, que segue igual.
    const apns = await sendApns(
      supabase,
      [record.user_id],
      {
        title: record.title ?? 'SquashBa',
        body: (record.body ?? '').slice(0, 120),
        threadId: record.type,
        url: record.url ?? '/',
      },
      (m) => console.log(`[notify-push] ${m}`),
    )

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key')
      .eq('user_id', record.user_id)

    if (!subs || subs.length === 0) {
      console.log(`[notify-push] no subscriptions for user=${record.user_id}`)
      return new Response(JSON.stringify({ sent: 0, apns }), { status: 200 })
    }

    console.log(`[notify-push] ${subs.length} subscription(s) found`)

    const payload = JSON.stringify({
      title: record.title ?? 'SquashBa',
      body: (record.body ?? '').slice(0, 120),
      url: record.url ?? '/',
    })

    let sent = 0
    const staleEndpoints: string[] = []

    await Promise.allSettled(
      subs.map(async (sub: { endpoint: string; p256dh: string; auth_key: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
            payload,
          )
          sent++
          console.log(`[notify-push] sent ok → ${sub.endpoint.slice(0, 60)}`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[notify-push] send error (${msg}) → ${sub.endpoint.slice(0, 60)}`)
          if (msg.includes('410') || msg.includes('404')) {
            staleEndpoints.push(sub.endpoint)
          }
        }
      }),
    )

    if (staleEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }

    console.log(`[notify-push] done: sent=${sent} stale=${staleEndpoints.length}`)

    return new Response(JSON.stringify({ sent, stale: staleEndpoints.length, apns }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-push error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
