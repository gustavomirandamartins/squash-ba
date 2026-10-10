'use client'

/**
 * CommentsSection — comentários de um post, carregados sob demanda.
 * Lê via browser client (RLS de leitura pública); inserir/excluir respeita a RLS
 * (autor, dono do post ou admin podem excluir). Atualiza a contagem no pai.
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Loader2, Send, Trash2, UserRound } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import type { CurrentUser, FeedComment } from './types'
import { ModerationMenu } from '@/components/moderation/ModerationMenu'

const MAX = 1000

export function CommentsSection({
  postId,
  postAuthorId,
  me,
  onCountChange,
}: {
  postId: string
  postAuthorId: string
  me: CurrentUser
  onCountChange: (delta: number) => void
}) {
  const [comments, setComments] = useState<FeedComment[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Carrega na montagem (a seção só é montada quando aberta).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('community_post_comments')
        .select('id, post_id, author_id, body, created_at, profiles!community_post_comments_author_id_fkey(full_name, avatar_url)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })

      if (cancelled) return
      const rows = (data ?? []) as unknown as Array<{
        id: string; post_id: string; author_id: string; body: string; created_at: string
        profiles: { full_name: string | null; avatar_url: string | null } | { full_name: string | null; avatar_url: string | null }[] | null
      }>
      setComments(
        rows.map((r) => {
          const pr = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
          return {
            id: r.id, post_id: r.post_id, author_id: r.author_id, body: r.body, created_at: r.created_at,
            author_name: pr?.full_name ?? null, author_avatar: pr?.avatar_url ?? null,
          }
        }),
      )
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [postId])

  async function send() {
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('community_post_comments')
      .insert({ post_id: postId, author_id: me.id, body: text })
      .select('id, created_at')
      .single()
    setSending(false)
    if (error || !data) return

    const fresh: FeedComment = {
      id: data.id as string,
      post_id: postId,
      author_id: me.id,
      body: text,
      created_at: data.created_at as string,
      author_name: me.name,
      author_avatar: me.avatar,
    }
    setComments((prev) => [...(prev ?? []), fresh])
    setBody('')
    onCountChange(+1)
    taRef.current?.focus()
  }

  // Bloqueou o autor: some tudo dele desta lista (o banco já não traz mais).
  function hideAuthor(authorId: string) {
    const gone = (comments ?? []).filter((c) => c.author_id === authorId).length
    setComments((prev) => (prev ?? []).filter((c) => c.author_id !== authorId))
    if (gone) onCountChange(-gone)
  }

  async function remove(id: string) {
    const supabase = createClient()
    const { error } = await supabase.from('community_post_comments').delete().eq('id', id)
    if (error) return
    setComments((prev) => (prev ?? []).filter((c) => c.id !== id))
    onCountChange(-1)
  }

  return (
    <div className="space-y-3 border-t border-white/8 pt-3">
      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-white/35">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando comentários…
        </div>
      ) : (
        <div className="space-y-3">
          {(comments ?? []).map((c) => {
            const canDelete = me.isAdmin || c.author_id === me.id || postAuthorId === me.id
            return (
              <div key={c.id} className="flex items-start gap-2.5">
                <CommentAvatar name={c.author_name} url={c.author_avatar} />
                <div className="min-w-0 flex-1">
                  <div className="rounded-2xl rounded-tl-sm bg-white/[0.05] px-3 py-2">
                    <p className="text-[13px] font-semibold text-white/85">{c.author_name ?? 'Jogador'}</p>
                    <p className="whitespace-pre-wrap break-words text-sm text-white/70">{c.body}</p>
                  </div>
                  <p className="mt-0.5 pl-1 text-[10px] text-white/30">{relTime(c.created_at)}</p>
                </div>
                <div className="mt-1">
                  <ModerationMenu
                    size="sm"
                    meId={me.id}
                    targetType="comment"
                    targetId={c.id}
                    ownerId={c.author_id}
                    ownerName={c.author_name}
                    onBlocked={() => hideAuthor(c.author_id)}
                  />
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/25 transition hover:bg-white/[0.06] hover:text-red-400"
                    aria-label="Excluir comentário"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}
          {comments && comments.length === 0 && (
            <p className="py-1 text-xs text-white/30">Seja o primeiro a comentar.</p>
          )}
        </div>
      )}

      {/* Composer */}
      <div className="flex items-end gap-2">
        <CommentAvatar name={me.name} url={me.avatar} />
        <textarea
          ref={taRef}
          value={body}
          maxLength={MAX}
          rows={1}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder="Escreva um comentário…"
          className="max-h-28 min-h-[38px] flex-1 resize-none rounded-2xl bg-white/[0.05] px-3.5 py-2 text-sm text-white placeholder-white/30 outline-none ring-1 ring-white/8 transition focus:ring-secondary/40"
        />
        <button
          type="button"
          onClick={send}
          disabled={!body.trim() || sending}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-primary transition active:scale-90 disabled:opacity-40"
          aria-label="Enviar comentário"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

function CommentAvatar({ name, url }: { name: string | null; url: string | null }) {
  if (url) {
    return (
      <Image src={url} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/10" />
    )
  }
  const initial = (name ?? '?').trim().charAt(0).toUpperCase()
  return (
    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.08] text-[11px] font-bold text-white/60 ring-1 ring-white/10">
      {initial || <UserRound className="h-3.5 w-3.5" />}
    </div>
  )
}

function relTime(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR })
  } catch {
    return ''
  }
}
