'use client'

/**
 * ConversationList — lista de conversas com Realtime + "Nova conversa".
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { MessageSquare, Plus, User, Users, Search, X, Trophy, ChevronRight } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
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

  async function startConversation(userId: string) {
    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
      _other_user_id: userId,
    })
    if (!error && data) onCreated(data as string)
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
              onClick={() => void startConversation(u.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition text-left"
            >
              {u.avatar_url ? (
                <Image src={u.avatar_url} alt={u.full_name ?? ''} width={36} height={36} className="rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-9 w-9 rounded-full bg-secondary/15 grid place-items-center shrink-0">
                  <User className="h-4 w-4 text-secondary" />
                </div>
              )}
              <span className="text-sm font-medium text-white/80">{u.full_name ?? 'Jogador'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── ConversationList ─────────────────────────────────────────────────────────

export function ConversationList({ initialConversations, currentUserId }: Props) {
  const router = useRouter()
  const [conversations, setConversations] = useState<ConvItem[]>(initialConversations)
  const [showNew, setShowNew] = useState(false)
  const [supabase] = useState(() => createClient())

  const refetch = useCallback(async () => {
    // Re-fetch conversation list
    const { data: memberships } = await supabase
      .from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', currentUserId)

    if (!memberships?.length) return

    const convIds = memberships.map((m: { conversation_id: string }) => m.conversation_id)
    const readMap = new Map(memberships.map((m: { conversation_id: string; last_read_at: string | null }) => [m.conversation_id, m.last_read_at]))

    const { data: convs } = await supabase
      .from('conversations')
      .select('id, kind, title, championship_id')
      .in('id', convIds)

    if (!convs) return

    // Último message por conversa
    const msgPromises = convIds.map((cid: string) =>
      supabase
        .from('messages')
        .select('body, created_at, sender_id')
        .eq('conversation_id', cid)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
        .then((r) => ({ cid, msg: r.data })),
    )
    const lastMsgs = await Promise.all(msgPromises)
    const lastMsgMap = new Map(lastMsgs.map(({ cid, msg }) => [cid, msg]))

    // Para 1:1: busca o outro membro
    const directConvIds = convs.filter((c: { kind: string }) => c.kind === 'direct').map((c: { id: string }) => c.id)
    const { data: allMembers } = directConvIds.length
      ? await supabase
          .from('conversation_members')
          .select('conversation_id, user_id')
          .in('conversation_id', directConvIds)
          .neq('user_id', currentUserId)
      : { data: [] }

    const otherUserIds = [...new Set((allMembers ?? []).map((m: { user_id: string }) => m.user_id))]
    const { data: otherProfiles } = otherUserIds.length
      ? await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', otherUserIds)
      : { data: [] }

    const profileMap = new Map((otherProfiles ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => [p.id, p]))
    const otherUserMap = new Map(
      (allMembers ?? []).map((m: { conversation_id: string; user_id: string }) => [m.conversation_id, m.user_id]),
    )

    const items: ConvItem[] = convs.map((c: { id: string; kind: string; title: string | null; championship_id: string | null }) => {
      const lastMsg = lastMsgMap.get(c.id)
      const lastReadAt = readMap.get(c.id)
      const otherUid = c.kind === 'direct' ? (otherUserMap.get(c.id) ?? null) : null
      const otherProfile = otherUid ? (profileMap.get(otherUid) ?? null) : null

      // Unread: count messages after last_read_at not from current user
      // (simplificado: usamos a data da última mensagem vs last_read_at)
      const unread =
        lastMsg && lastMsg.sender_id !== currentUserId && lastReadAt
          ? lastMsg.created_at > lastReadAt
            ? 1
            : 0
          : 0

      return {
        id: c.id,
        kind: c.kind as 'direct' | 'group',
        title: c.title,
        championshipId: c.championship_id,
        lastMessageBody: lastMsg?.body ?? null,
        lastMessageAt: lastMsg?.created_at ?? null,
        unreadCount: unread,
        otherUserId: otherUid,
        otherUserName: otherProfile?.full_name ?? null,
        otherUserAvatar: otherProfile?.avatar_url ?? null,
      }
    })

    items.sort((a, b) => {
      const ta = a.lastMessageAt ?? '0'
      const tb = b.lastMessageAt ?? '0'
      return tb > ta ? 1 : -1
    })

    setConversations(items)
  }, [supabase, currentUserId])

  // Realtime: qualquer mensagem nova → refetch lista
  useEffect(() => {
    const ch = supabase
      .channel('conv-list-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { void refetch() },
      )
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [supabase, refetch])

  function handleCreated(id: string) {
    setShowNew(false)
    router.push(`/mensagens/${id}`)
  }

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0)

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-secondary" />
          <h1 className="text-base font-bold text-white">Mensagens</h1>
          {totalUnread > 0 && (
            <span className="h-5 min-w-5 px-1 rounded-full bg-secondary text-primary text-[10px] font-black grid place-items-center">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 rounded-full bg-secondary/15 px-3 py-1.5 text-xs font-semibold text-secondary transition active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova
        </button>
      </div>

      {/* Lista */}
      {conversations.length === 0 ? (
        <div className="glass glass-card px-4 py-12 text-center space-y-2">
          <MessageSquare className="h-8 w-8 text-white/15 mx-auto" />
          <p className="text-sm text-white/35">Nenhuma conversa ainda.</p>
          <p className="text-xs text-white/20">Toque em "Nova" para começar.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {conversations.map((conv) => {
            const name =
              conv.kind === 'direct'
                ? (conv.otherUserName ?? 'Jogador')
                : (conv.title ?? 'Grupo')

            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => router.push(`/mensagens/${conv.id}`)}
                className="w-full glass glass-card px-3.5 py-3 flex items-center gap-3 text-left transition active:scale-[0.985]"
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
              </button>
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
