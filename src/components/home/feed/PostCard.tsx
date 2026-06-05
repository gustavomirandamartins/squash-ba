'use client'

/**
 * PostCard — um item do feed da comunidade (estilo Instagram).
 * Cabeçalho (avatar + nome + tempo + excluir) · texto · mídia.
 * Mídia: foto (bucket), YouTube/Instagram (iframe embed) ou link (cartão).
 */

import { useState, useTransition, Fragment } from 'react'
import Image from 'next/image'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Trash2, ExternalLink, Globe, UserRound, Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { prettyDomain, parseMediaUrl } from './embed'
import type { FeedPost } from './types'

const URL_SPLIT = /(https?:\/\/[^\s<>"')]+)/gi
const URL_ONE = /^https?:\/\/[^\s<>"')]+$/i

export function PostCard({
  post,
  canDelete,
  onDeleted,
}: {
  post: FeedPost
  canDelete: boolean
  onDeleted: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function remove() {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('community_posts').delete().eq('id', post.id)
      if (post.image_path) {
        await supabase.storage.from('community').remove([post.image_path])
      }
      onDeleted()
    })
  }

  const when = (() => {
    try {
      return formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: ptBR })
    } catch {
      return ''
    }
  })()

  return (
    <article className="glass glass-card space-y-3 px-3.5 py-3.5">
      {/* Cabeçalho */}
      <header className="flex items-center gap-2.5">
        {post.author_avatar ? (
          <Image
            src={post.author_avatar}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
          />
        ) : (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.08] text-xs font-bold text-white/60 ring-1 ring-white/10">
            {(post.author_name ?? '?').trim().charAt(0).toUpperCase() || <UserRound className="h-4 w-4" />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white/90">{post.author_name ?? 'Jogador'}</p>
          <p className="text-[11px] text-white/35">{when}</p>
        </div>

        {canDelete && (
          confirming ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={pending}
                onClick={remove}
                className="rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-bold text-red-400 transition active:scale-95 disabled:opacity-40"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Excluir'}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirming(false)}
                className="rounded-full px-2 py-1 text-[11px] font-semibold text-white/40 transition hover:text-white/70"
              >
                Não
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/30 transition hover:bg-white/[0.06] hover:text-red-400"
              aria-label="Excluir post"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )
        )}
      </header>

      {/* Texto */}
      {post.body && (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/80">
          {linkify(post.body)}
        </p>
      )}

      {/* Mídia */}
      <Media post={post} />
    </article>
  )
}

function Media({ post }: { post: FeedPost }) {
  // Foto
  if (post.image_url) {
    return (
      <div className="overflow-hidden rounded-xl bg-black/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={post.image_url}
          alt=""
          loading="lazy"
          className="max-h-[520px] w-full object-cover"
        />
      </div>
    )
  }

  if (!post.embed_url) return null

  // YouTube — 16:9 responsivo
  if (post.embed_provider === 'youtube') {
    const parsed = parseMediaUrl(post.embed_url)
    if (parsed?.embedSrc) {
      return (
        <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '16 / 9' }}>
          <iframe
            src={parsed.embedSrc}
            title="YouTube"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      )
    }
  }

  // Instagram — embed em iframe (sem script externo)
  if (post.embed_provider === 'instagram') {
    const parsed = parseMediaUrl(post.embed_url)
    if (parsed?.embedSrc) {
      return (
        <div className="overflow-hidden rounded-xl bg-white">
          <iframe
            src={parsed.embedSrc}
            title="Instagram"
            loading="lazy"
            scrolling="no"
            className="w-full border-0"
            style={{ height: 560 }}
          />
        </div>
      )
    }
  }

  // Link genérico — cartão clicável
  return (
    <a
      href={post.embed_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 transition hover:bg-white/[0.07]"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary/12 text-secondary">
        <Globe className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white/85">{prettyDomain(post.embed_url)}</p>
        <p className="truncate text-xs text-white/40">{post.embed_url}</p>
      </div>
      <ExternalLink className="h-4 w-4 shrink-0 text-white/30" />
    </a>
  )
}

// Transforma URLs do texto em links clicáveis (sem dependência externa).
function linkify(text: string) {
  return text.split(URL_SPLIT).map((part, i) =>
    URL_ONE.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-secondary underline decoration-secondary/40 underline-offset-2 hover:decoration-secondary"
      >
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}
