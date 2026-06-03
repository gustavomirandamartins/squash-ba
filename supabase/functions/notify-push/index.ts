/**
 * notify-push — Edge Function genérica de Web Push.
 *
 * Disparada via Database Webhook em public.notifications (INSERT).
 * Envia uma Web Push para todas as subscriptions do destinatário (user_id).
 *
 * Mensagens (type='mensagem') são IGNORADAS aqui: elas já têm push próprio via
 * a função send-push (webhook em public.messages), evitando push duplicado.
 *
 * Configuração (uma vez, no dashboard): Database Webhooks → criar webhook em
 * `public.notifications` evento INSERT → HTTP POST para esta função.
 */

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT')     ?? 'mailto:contato@gustavomartins.com'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req: Request) => {
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

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key')
      .eq('user_id', record.user_id)

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
    }

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
        } catch (err) {
          if (err instanceof Error && err.message.includes('410')) {
            staleEndpoints.push(sub.endpoint)
          }
        }
      }),
    )

    if (staleEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }

    return new Response(JSON.stringify({ sent, stale: staleEndpoints.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('notify-push error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
