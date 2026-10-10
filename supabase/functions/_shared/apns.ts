/**
 * APNs — push no app iOS. Usado por send-push (mensagens) e notify-push
 * (notificações), ao lado do Web Push.
 *
 * Autenticação por token: JWT ES256 assinado com a chave .p8 da Apple
 * (secrets APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY e APNS_BUNDLE_ID).
 * O JWT é reaproveitado enquanto válido (a Apple aceita até 60 min; renovamos
 * aos 50, ou antes se ela recusar o token).
 *
 * Aparelhos em public.push_devices (register_push_device): o host de sandbox
 * ou de produção sai do environment de cada um. Token que a Apple recusa como
 * inválido ou desregistrado é apagado; outros erros ficam em last_error.
 *
 * Sem os secrets, não envia nada e registra isso no log — uma vez por chamada.
 */

// deno-lint-ignore-file no-explicit-any
type Supabase = any

type ApnsConfig = { keyId: string; teamId: string; privateKey: string; bundleId: string }

export type ApnsMessage = {
  title: string
  body: string
  /** agrupa as notificações no iPhone: a conversa (mensagens) ou o tipo */
  threadId: string
  /** tela que o app abre ao tocar na notificação */
  url: string
}

export type ApnsResult = {
  skipped?: 'sem_secrets'
  devices: number
  sent: number
  removed: number
  failed: number
}

const HOSTS: Record<string, string> = {
  sandbox: 'api.sandbox.push.apple.com',
  production: 'api.push.apple.com',
}
const JWT_TTL_S = 50 * 60

function apnsConfig(): ApnsConfig | null {
  const keyId = Deno.env.get('APNS_KEY_ID') ?? ''
  const teamId = Deno.env.get('APNS_TEAM_ID') ?? ''
  const privateKey = Deno.env.get('APNS_PRIVATE_KEY') ?? ''
  const bundleId = Deno.env.get('APNS_BUNDLE_ID') ?? ''
  if (!keyId || !teamId || !privateKey || !bundleId) return null
  return { keyId, teamId, privateKey, bundleId }
}

const encoder = new TextEncoder()

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function importKey(pem: string): Promise<CryptoKey> {
  // Aceita a .p8 com quebras de linha reais ou escritas como "\n".
  const base64 = pem
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const der = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

// Reaproveitado entre chamadas enquanto a instância da função estiver viva.
let cachedJwt: { token: string; issuedAt: number; keyId: string } | null = null

async function providerToken(cfg: ApnsConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedJwt && cachedJwt.keyId === cfg.keyId && now - cachedJwt.issuedAt < JWT_TTL_S) {
    return cachedJwt.token
  }
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }))
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: now }))
  const key = await importKey(cfg.privateKey)
  // WebCrypto devolve a assinatura ECDSA já no formato do JWT (r || s).
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`)),
  )
  const token = `${header}.${claims}.${b64url(signature)}`
  cachedJwt = { token, issuedAt: now, keyId: cfg.keyId }
  return token
}

/** Envia para todos os aparelhos iOS dos usuários. Nunca lança: erros vão para o log. */
export async function sendApns(
  supabase: Supabase,
  userIds: string[],
  msg: ApnsMessage,
  log: (message: string) => void,
): Promise<ApnsResult> {
  const none: ApnsResult = { devices: 0, sent: 0, removed: 0, failed: 0 }
  const cfg = apnsConfig()
  if (!cfg) {
    log('[apns] secrets APNS_* ausentes: envio por APNs pulado')
    return { ...none, skipped: 'sem_secrets' }
  }
  if (userIds.length === 0) return none

  try {
    const { data: devices, error } = await supabase
      .from('push_devices')
      .select('id, token, environment')
      .in('user_id', userIds)
    if (error) {
      log(`[apns] falha ao ler aparelhos: ${error.message}`)
      return none
    }
    if (!devices || devices.length === 0) return none

    const jwt = await providerToken(cfg)
    const payload = JSON.stringify({
      aps: {
        alert: { title: msg.title, body: msg.body },
        sound: 'default',
        'thread-id': msg.threadId,
      },
      url: msg.url,
    })

    let sent = 0
    const removeIds: string[] = []
    const errors: { id: string; reason: string }[] = []

    await Promise.allSettled(
      devices.map(async (d: { id: string; token: string; environment: string }) => {
        try {
          const res = await fetch(`https://${HOSTS[d.environment] ?? HOSTS.production}/3/device/${d.token}`, {
            method: 'POST',
            headers: {
              authorization: `bearer ${jwt}`,
              'apns-topic': cfg.bundleId,
              'apns-push-type': 'alert',
              'apns-priority': '10',
              'content-type': 'application/json',
            },
            body: payload,
          })
          if (res.ok) {
            sent++
            return
          }
          let reason = `HTTP ${res.status}`
          try {
            const body = await res.json()
            if (body?.reason) reason = String(body.reason)
          } catch {
            /* sem corpo */
          }
          // Token inválido ou desregistrado: não serve mais, apaga.
          if (res.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') {
            removeIds.push(d.id)
          } else {
            // JWT recusado: gera outro na próxima chamada.
            if (reason === 'ExpiredProviderToken' || reason === 'InvalidProviderToken') cachedJwt = null
            errors.push({ id: d.id, reason })
          }
        } catch (err) {
          errors.push({ id: d.id, reason: err instanceof Error ? err.message : String(err) })
        }
      }),
    )

    if (removeIds.length > 0) {
      await supabase.from('push_devices').delete().in('id', removeIds)
    }
    for (const e of errors) {
      await supabase.from('push_devices').update({ last_error: e.reason.slice(0, 200) }).eq('id', e.id)
    }

    log(`[apns] aparelhos=${devices.length} enviados=${sent} removidos=${removeIds.length} falhas=${errors.length}`)
    return { devices: devices.length, sent, removed: removeIds.length, failed: errors.length }
  } catch (err) {
    log(`[apns] erro: ${err instanceof Error ? err.message : String(err)}`)
    return none
  }
}
