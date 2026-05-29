/**
 * send-push — Edge Function para Web Push notifications.
 *
 * Disparada via Database Webhook em public.messages (INSERT).
 * Para cada membro da conversa (exceto o sender) com push_subscription
 * registrada, envia uma Web Push notification via VAPID.
 */

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT')     ?? 'mailto:contato@gustavomartins.com'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

// Cliente com service_role para ignorar RLS
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json() as {
      record: {
        id: string
        conversation_id: string
        sender_id: string
        body: string
      }
    }

    const { record } = body
    const { conversation_id, sender_id, body: messageBody } = record

    // 1. Busca nome do sender
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', sender_id)
      .single()

    const senderName = senderProfile?.full_name ?? 'Alguém'

    // 2. Busca membros da conversa exceto o sender
    const { data: members } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conversation_id)
      .neq('user_id', sender_id)

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
    }

    const memberIds = members.map((m: { user_id: string }) => m.user_id)

    // 3. Busca push subscriptions dos membros
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key, user_id')
      .in('user_id', memberIds)

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
    }

    // 4. Envia notificações — falhas silenciosas por assinatura
    const payload = JSON.stringify({
      title: senderName,
      body: messageBody.slice(0, 80),
      url: '/mensagens',
    })

    let sent = 0
    const staleEndpoints: string[] = []

    await Promise.allSettled(
      subs.map(async (sub: { endpoint: string; p256dh: string; auth_key: string; user_id: string }) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth_key },
            },
            payload,
          )
          sent++
        } catch (err) {
          // 410 Gone = assinatura expirada, remove
          if (err instanceof Error && err.message.includes('410')) {
            staleEndpoints.push(sub.endpoint)
          }
          // outras falhas são silenciosas
        }
      }),
    )

    // Remove assinaturas expiradas
    if (staleEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', staleEndpoints)
    }

    return new Response(JSON.stringify({ sent, stale: staleEndpoints.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-push error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
