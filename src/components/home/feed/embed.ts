/**
 * Detecção de mídia para o feed da comunidade.
 *
 * A partir de uma URL colada no texto do post, descobrimos o provedor e a URL
 * de incorporação (embed). Vídeos NÃO são hospedados no Supabase — apenas a URL
 * é guardada e exibida via <iframe>, economizando espaço no plano gratuito.
 *
 *   • YouTube   → https://www.youtube.com/embed/<id>
 *   • Instagram → https://www.instagram.com/p|reel/<code>/embed
 *   • outros    → tratados como link (cartão clicável)
 */

export type EmbedProvider = 'youtube' | 'instagram' | 'link'

export type ParsedMedia = {
  provider: EmbedProvider
  /** URL canônica (a que o usuário colou / forma normalizada). */
  url: string
  /** URL para usar dentro de um <iframe>. Ausente em provider 'link'. */
  embedSrc?: string
}

// Primeira URL http(s) encontrada em um texto livre.
const URL_RE = /(https?:\/\/[^\s<>"')]+)/i

export function extractFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.match(URL_RE)
  return m ? m[1] : null
}

// ── YouTube ───────────────────────────────────────────────────────────────────
// Formatos: youtu.be/<id>, youtube.com/watch?v=<id>, /shorts/<id>, /embed/<id>
function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '')
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0]
    return id || null
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') return u.searchParams.get('v')
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'v') {
      return parts[1] ?? null
    }
  }
  return null
}

// ── Instagram ─────────────────────────────────────────────────────────────────
// Formatos: instagram.com/p/<code>/, /reel/<code>/, /tv/<code>/
function instagramCode(u: URL): { code: string; kind: string } | null {
  const host = u.hostname.replace(/^www\./, '')
  if (host !== 'instagram.com' && host !== 'instagr.am') return null
  const parts = u.pathname.split('/').filter(Boolean)
  const idx = parts.findIndex((p) => p === 'p' || p === 'reel' || p === 'tv')
  if (idx >= 0 && parts[idx + 1]) {
    return { code: parts[idx + 1], kind: parts[idx] }
  }
  return null
}

/**
 * Classifica uma URL em provedor + fonte de embed. Retorna null se a string não
 * for uma URL http(s) válida.
 */
export function parseMediaUrl(raw: string): ParsedMedia | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null

  const yt = youtubeId(u)
  if (yt) {
    return {
      provider: 'youtube',
      url: `https://www.youtube.com/watch?v=${yt}`,
      embedSrc: `https://www.youtube-nocookie.com/embed/${yt}`,
    }
  }

  const ig = instagramCode(u)
  if (ig) {
    return {
      provider: 'instagram',
      url: `https://www.instagram.com/${ig.kind}/${ig.code}/`,
      embedSrc: `https://www.instagram.com/${ig.kind}/${ig.code}/embed`,
    }
  }

  return { provider: 'link', url: u.toString() }
}

/** Domínio limpo para exibir em cartões de link. */
export function prettyDomain(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '')
  } catch {
    return raw
  }
}
