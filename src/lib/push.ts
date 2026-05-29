'use client'

/**
 * push.ts — Web Push subscription management.
 *
 * subscribePush(): registra SW → requestPermission → subscribe VAPID → salva no banco.
 * unsubscribePush(): cancela subscription + remove do banco.
 */

import { createClient } from '@/utils/supabase/client'

/** Converte ArrayBuffer para base64url */
function bufferToBase64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function subscribePush(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    console.warn('NEXT_PUBLIC_VAPID_PUBLIC_KEY não configurada')
    return false
  }

  // Solicita permissão
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  // Aguarda SW estar pronto
  const registration = await navigator.serviceWorker.ready

  // Inscreve no Push
  let sub: PushSubscription
  try {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    })
  } catch {
    return false
  }

  const json = sub.toJSON()
  const endpoint = json.endpoint ?? ''
  const p256dh = bufferToBase64url(sub.getKey('p256dh')!)
  const auth_key = bufferToBase64url(sub.getKey('auth')!)

  const supabase = createClient()

  // Obtém o user_id da sessão (obrigatório: coluna NOT NULL)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: user.id, endpoint, p256dh, auth_key },
    { onConflict: 'user_id,endpoint' },
  )

  if (error) console.error('push_subscriptions upsert:', error)
  return !error
}

export async function unsubscribePush(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  const registration = await navigator.serviceWorker.ready
  const sub = await registration.pushManager.getSubscription()
  if (!sub) return

  const endpoint = sub.endpoint
  await sub.unsubscribe()

  const supabase = createClient()
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}
