'use client'

/**
 * ConversationList — lista de conversas com Realtime + "Nova conversa" + apagar.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { MessageSquare, Plus, User, Users, Search, X, Trophy, ChevronRight, Trash2, Pencil } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { toConvItems, type ConvRow } from '@/lib/conversations'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ConvItem = {
  id: string
  kind: 'direct' | 'group'
  title: string | null
  championshipId: string | null
  lastMessageBody: string | null
  lastMessageAt: string | null
  unreadCount: number
  otherUserId: string | null
  otherUserName: string | null
  otherUserAvatar: string | null
}

type Props = {
  initialConversations: ConvItem[]
  currentUserId: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return formatDistanceToNowStrict(parseISO(iso), { locale: ptBR, addSuffix: false })
  } catch {
    return ''
  }
}

function Avatar({ item, size = 40 }: { item: ConvItem; size?: number }) {
  if (item.kind === 'direct') {
    if (item.otherUserAvatar) {
      return (
        <Image
          src={item.otherUserAvatar}
          alt={item.otherUserName ?? ''}
          width={size}
          height={size}
          className="rounded-full object-cover shrink-0 ring-1 ring-white/10"
          style={{ width: size, height: size }}
        />
      )
    }
    return (
      <div
        className="rounded-full bg-secondary/15 grid place-items-center shrink-0"
        style={{ width: size, height: size }}
      >
        <User className="text-secondary" style={{ width: size * 0.45, height: size * 0.45 }} />
      </div>
    )
  }
  return (
    <div
      className="rounded-full bg-white/8 grid place-items-center shrink-0"
      style={{ width: size, height: size }}
    >
      <Trophy className="text-secondary/60" style={{ width: size * 0.45, height: size * 0.45 }} />
    </div>
  )
}

// ─── Nova conversa modal ──────────────────────────────────────────────────────

function NewConversationSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; full_name: string | null; avatar_url: string | null }>>([])
  const [loading, setLoading] = useState(false)
  const [supabase] = useState(() => createClient())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .ilike('full_name', `%${query.trim()}%`)
        .limit(10)
      setResults(data ?? [])
      setLoading(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query, supabase])

  const [starting, setStarting] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)

  async function startConversation(userId: string) {
    setStarting(userId)
    setStartError(null)
    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
      _other_user_id: userId,
    })
    setStarting(null)
    if (error) {
      console.error('get_or_create_direct_conversation:', error)
      setStartError('Não foi possível criar a conversa. Tente novamente.')
      return
    }
    if (!data) {
      setStartError('Resposta inesperada. Tente novamente.')
      return
    }
    onCreated(data as string)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[480px] glass rounded-t-3xl px-4 pt-4 pb-10 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-2" />
        <p className="text-sm font-bold text-white/80 text-center">Nova conversa</p>

        {startError && (
          <p className="text-xs text-red-400 text-center bg-red-500/10 rounded-xl px-3 py-2">{startError}</p>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 bg-white/[0.07] rounded-full px-3 py-2.5">
          <Search className="h-4 w-4 text-white/30 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar jogador…"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')}>
              <X className="h-3.5 w-3.5 text-white/30" />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {loading && (
            <p className="text-xs text-white/30 text-center py-4">Buscando…</p>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <p className="text-xs text-white/30 text-center py-4">Nenhum jogador encontrado.</p>
          )}
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              disabled={starting === u.id}
              onClick={() => void startConversation(u.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition text-left disabled:opacity-50"
            >
              {u.avatar_url ? (
                <Image src={u.avatar_url} alt={u.full_name ?? ''} width={36} height={36} style={{ width: 36, height: 36 }} className="rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-9 w-9 rounded-full bg-secondary/15 grid place-items-center shrink-0">
                  <User className="h-4 w-4 text-secondary" />
                </div>
              )}
              <span className="text-sm font-medium text-white/80">
                {starting === u.id ? 'Abrindo…' : (u.full_name ?? 'Jogador')}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── DeleteButton ─────────────────────────────────────────────────────────────

/**
 * Botão vermelho com dupla confirmação: primeiro toque mostra ícone de lixeira,
 * segundo confirma. Reset automático em 2 s se não confirmado.
 */
function DeleteButton({
  onConfirm,
  busy,
}: {
  onConfirm: () => void
  busy: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handlePress() {
    if (busy) return
    if (!confirming) {
      setConfirming(true)
      timerRef.current = setTimeout(() => setConfirming(false), 2000)
    } else {
      if (timerRef.current) clearTimeout(timerRef.current)
      onConfirm()
    }
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <button
      type="button"
      onClick={handlePress}
      disabled={busy}
      aria-label="Apagar conversa"
      className={[
        'h-8 w-8 shrink-0 rounded-full grid place-items-center transition-all duration-200',
        confirming
          ? 'bg-red-500 scale-110'
          : 'bg-red-500/15 hover:bg-red-500/30',
        busy ? 'opacity-40' : '',
      ].join(' ')}
    >
      {busy ? (
        <span className="h-3.5 w-3.5 rounded-full border-2 border-red-400/30 border-t-red-400 animate-spin" />
      ) : (
        <Trash2 className={`h-3.5 w-3.5 ${confirming ? 'text-white' : 'text-red-400'}`} />
      )}
    </button>
  )
}

// ─── ConversationList ─────────────────────────────────────────────────────────

export function ConversationList({ initialConversations, currentUserId }: Props) {
  const router = useRouter()
  const [conversations, setConversations] = useState<ConvItem[]>(initialConversations)
  const [showNew, setShowNew] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [supabase] = useState(() => createClient())

  // Uma chamada (RPC get_my_conversations) — antes, uma consulta por conversa.
  const refetch = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_conversations')
    if (!error) setConversations(toConvItems(data as ConvRow[] | null))
  }, [supabase])

  // Realtime: qualquer mensagem nova → refetch lista
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    async function setup() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token)
      if (cancelled) return

      channel = supabase
        .channel('conv-list-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          () => { void refetch() },
        )
        .subscribe()
    }

    void setup()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [supabase, refetch])

  // Sai do modo edição ao clicar fora da lista
  useEffect(() => {
    if (!editMode) return
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-conv-list]')) setEditMode(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [editMode])

  function handleCreated(id: string) {
    setShowNew(false)
    router.push(`/mensagens/${id}`)
  }

  async function handleDelete(convId: string) {
    setDeletingId(convId)
    try {
      // Remove o membership do usuário. Se a conversa ficou sem membros,
      // a política/cascade do Supabase apaga a conversa também.
      await supabase
        .from('conversation_members')
        .delete()
        .eq('conversation_id', convId)
        .eq('user_id', currentUserId)

      // Atualiza local imediatamente
      setConversations((prev) => prev.filter((c) => c.id !== convId))
    } finally {
      setDeletingId(null)
    }
  }

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0)
  // Apenas conversas diretas podem ser apagadas pelo usuário
  const hasDeletable = conversations.some((c) => c.kind === 'direct')

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-secondary" />
          <h1 className="font-display text-lg font-bold text-white">Mensagens</h1>
          {totalUnread > 0 && !editMode && (
            <span className="h-5 min-w-5 px-1 rounded-full bg-secondary text-primary text-[10px] font-black grid place-items-center">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasDeletable && (
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={[
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95',
                editMode
                  ? 'bg-secondary/20 text-secondary'
                  : 'bg-white/8 text-white/50 hover:text-white/80',
              ].join(' ')}
            >
              {editMode ? (
                <>Concluído</>
              ) : (
                <>
                  <Pencil className="h-3 w-3" />
                  Editar
                </>
              )}
            </button>
          )}
          {!editMode && (
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 rounded-full bg-secondary/15 px-3 py-1.5 text-xs font-semibold text-secondary transition active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova
            </button>
          )}
        </div>
      </div>

      {/* Lista */}
      {conversations.length === 0 ? (
        <div className="glass glass-card px-4 py-12 text-center space-y-2">
          <MessageSquare className="h-8 w-8 text-white/15 mx-auto" />
          <p className="text-sm text-white/35">Nenhuma conversa ainda.</p>
          <p className="text-xs text-white/20">Toque em "Nova" para começar.</p>
        </div>
      ) : (
        <div className="space-y-1.5" data-conv-list>
          {conversations.map((conv) => {
            const name =
              conv.kind === 'direct'
                ? (conv.otherUserName ?? 'Jogador')
                : (conv.title ?? 'Grupo')

            const canDelete = conv.kind === 'direct'

            return (
              <div
                key={conv.id}
                className="flex items-center gap-2"
              >
                {/* Botão apagar — só em modo edição e apenas diretas */}
                {editMode && canDelete && (
                  <DeleteButton
                    onConfirm={() => void handleDelete(conv.id)}
                    busy={deletingId === conv.id}
                  />
                )}

                {/* Card da conversa */}
                <button
                  type="button"
                  onClick={() => {
                    if (editMode) return
                    router.push(`/mensagens/${conv.id}`)
                  }}
                  className={[
                    'flex-1 glass glass-card px-3.5 py-3 flex items-center gap-3 text-left transition active:scale-[0.985]',
                    editMode ? 'cursor-default' : '',
                    deletingId === conv.id ? 'opacity-40' : '',
                  ].join(' ')}
                >
                  <Avatar item={conv} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-semibold text-white/85 truncate">{name}</span>
                      {conv.kind === 'group' && (
                        <span className="shrink-0 text-[9px] font-bold text-secondary/60 bg-secondary/10 rounded-full px-1.5 py-px">
                          Grupo
                        </span>
                      )}
                    </div>
                    {conv.lastMessageBody && (
                      <p className={`text-xs mt-0.5 truncate ${conv.unreadCount > 0 ? 'text-white/65 font-medium' : 'text-white/35'}`}>
                        {conv.lastMessageBody}
                      </p>
                    )}
                  </div>
                  {!editMode && (
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {conv.lastMessageAt && (
                        <span className="text-[10px] text-white/25">{relativeTime(conv.lastMessageAt)}</span>
                      )}
                      {conv.unreadCount > 0 ? (
                        <span className="h-4.5 min-w-4.5 px-1 rounded-full bg-secondary text-primary text-[9px] font-black grid place-items-center">
                          {conv.unreadCount}
                        </span>
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-white/15" />
                      )}
                    </div>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Nova conversa sheet */}
      {showNew && (
        <NewConversationSheet onClose={() => setShowNew(false)} onCreated={handleCreated} />
      )}
    </div>
  )
}
