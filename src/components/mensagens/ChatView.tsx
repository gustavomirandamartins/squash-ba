'use client'

/**
 * ChatView — tela de chat com Realtime, envio otimista e link preview.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Send, User, Trophy, ExternalLink } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { onAppReturn } from '@/lib/on-app-return'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ChatMessage = {
  id: string
  senderId: string
  senderName: string | null
  senderAvatar: string | null
  body: string
  createdAt: string
  isOwn: boolean
}

export type ConvMeta = {
  id: string
  kind: 'direct' | 'group'
  title: string | null
  otherUserName: string | null
  otherUserAvatar: string | null
}

type Props = {
  conv: ConvMeta
  initialMessages: ChatMessage[]
  currentUserId: string
}

// ─── Timestamp helper ─────────────────────────────────────────────────────────

/**
 * Formata a data de uma mensagem de forma legível.
 * Mensagens com menos de 60 s mostram "agora" em vez de "X segundos".
 */
function formatMsgTime(isoString: string): string {
  try {
    const diff = Date.now() - new Date(isoString).getTime()
    if (diff < 60_000) return 'agora'
    return formatDistanceToNowStrict(parseISO(isoString), {
      locale: ptBR,
      addSuffix: false,
    })
  } catch {
    return ''
  }
}

// ─── URL detection ────────────────────────────────────────────────────────────

const URL_RE = /(https?:\/\/[^\s]+)/g

function extractUrls(text: string): string[] {
  return text.match(URL_RE) ?? []
}

function formatDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function Bubble({
  msg,
  showSender,
  isGroup,
}: {
  msg: ChatMessage
  showSender: boolean
  isGroup: boolean
}) {
  const urls = extractUrls(msg.body)
  const textParts = msg.body.split(URL_RE)

  return (
    <div className={`flex items-end gap-2 ${msg.isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar (apenas mensagens alheias, primeira em sequência) */}
      {!msg.isOwn && isGroup && (
        <div className="shrink-0 self-end mb-0.5">
          {showSender && msg.senderAvatar ? (
            <Image
              src={msg.senderAvatar}
              alt={msg.senderName ?? ''}
              width={26}
              height={26}
              style={{ width: 26, height: 26 }}
              className="rounded-full object-cover ring-1 ring-white/10"
            />
          ) : (
            <div className="h-[26px] w-[26px] rounded-full bg-white/5" />
          )}
        </div>
      )}

      <div className={`max-w-[75%] space-y-1 ${msg.isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Sender name em grupos */}
        {isGroup && !msg.isOwn && showSender && (
          <span className="text-[10px] font-semibold text-secondary/70 px-1">
            {msg.senderName ?? 'Jogador'}
          </span>
        )}

        {/* Bolha */}
        <div
          className={[
            'rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
            msg.isOwn
              ? 'rounded-br-sm bg-secondary/15 ring-1 ring-secondary/30 text-white'
              : 'rounded-bl-sm bg-white/[0.08] ring-1 ring-white/8 text-white/85',
          ].join(' ')}
        >
          {/* Texto com links inline */}
          {textParts.map((part, i) =>
            URL_RE.test(part) ? (
              <a
                key={i}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="text-secondary underline decoration-secondary/40 break-all"
              >
                {part}
              </a>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </div>

        {/* Link preview cards */}
        {urls.map((url) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              'flex items-center gap-2 px-3 py-2 rounded-xl text-left',
              'bg-white/[0.05] ring-1 ring-white/8 hover:bg-white/[0.09] transition',
              'max-w-full',
            ].join(' ')}
          >
            <ExternalLink className="h-3.5 w-3.5 text-secondary/60 shrink-0" />
            <span className="text-[11px] text-secondary/70 truncate">{formatDomain(url)}</span>
          </a>
        ))}

        {/* Timestamp — suppressHydrationWarning: tempo relativo difere entre SSR e cliente */}
        <span className="text-[9px] text-white/20 px-1" suppressHydrationWarning>
          {formatMsgTime(msg.createdAt)}
        </span>
      </div>
    </div>
  )
}

// ─── ChatView ─────────────────────────────────────────────────────────────────

export function ChatView({ conv, initialMessages, currentUserId }: Props) {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [supabase] = useState(() => createClient())
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isGroup = conv.kind === 'group'

  const convName = isGroup
    ? (conv.title ?? 'Grupo')
    : (conv.otherUserName ?? 'Conversa')

  // Ticker: força re-render a cada 30 s para atualizar os timestamps relativos
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Scroll para o fundo
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior })
  }, [])

  useEffect(() => {
    scrollToBottom('instant')
  }, [scrollToBottom])

  useEffect(() => {
    scrollToBottom('smooth')
  }, [messages, scrollToBottom])

  // Marca como lido ao abrir/focar
  const markRead = useCallback(async () => {
    await supabase
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conv.id)
      .eq('user_id', currentUserId)
  }, [supabase, conv.id, currentUserId])

  useEffect(() => {
    void markRead()
    // Volta ao app: marca como lido no máximo a cada 30 s.
    return onAppReturn(() => void markRead())
  }, [markRead])

  // Realtime: novas mensagens
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    async function setup() {
      // CRÍTICO: a tabela messages tem RLS. O Realtime só entrega eventos se a
      // conexão WebSocket estiver autenticada com o JWT do usuário. O token é
      // carregado de forma assíncrona dos cookies, então precisamos garantir que
      // setAuth() rode ANTES de subscribe() — senão a conexão entra como anon e
      // a RLS bloqueia todos os eventos.
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token)
      }
      if (cancelled) return

      channel = supabase
        .channel(`chat-${conv.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conv.id}`,
          },
          (payload) => {
            const row = payload.new as {
              id: string
              sender_id: string
              body: string
              created_at: string
            }

            // Evita duplicata com mensagem otimista
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev

              // Busca perfil do sender (já deve estar em cache ou é o próprio user)
              const existing = prev.find((m) => m.senderId === row.sender_id)
              const isOwn = row.sender_id === currentUserId

              const newMsg: ChatMessage = {
                id: row.id,
                senderId: row.sender_id,
                senderName: isOwn ? null : (existing?.senderName ?? 'Jogador'),
                senderAvatar: isOwn ? null : (existing?.senderAvatar ?? null),
                body: row.body,
                createdAt: row.created_at,
                isOwn,
              }
              // Remove eventual otimista do próprio user (substituído pelo real)
              const base = isOwn
                ? prev.filter((m) => !(m.id.startsWith('optimistic-') && m.body === row.body))
                : prev
              return [...base, newMsg].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            })

            if (row.sender_id !== currentUserId) void markRead()
          },
        )
        .subscribe()
    }

    void setup()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [supabase, conv.id, currentUserId, markRead])

  // Auto-resize textarea
  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 100)}px`
  }

  async function sendMessage() {
    const body = input.trim()
    if (!body || sending) return

    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setSending(true)

    // Otimista
    const optimisticId = `optimistic-${Date.now()}`
    const optimistic: ChatMessage = {
      id: optimisticId,
      senderId: currentUserId,
      senderName: null,
      senderAvatar: null,
      body,
      createdAt: new Date().toISOString(),
      isOwn: true,
    }
    setMessages((prev) => [...prev, optimistic])

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conv.id, sender_id: currentUserId, body })
        .select('id, created_at')
        .single()

      if (!error && data) {
        // Substitui otimista pelo real
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId
              ? { ...m, id: data.id, createdAt: data.created_at }
              : m,
          ),
        )
      } else {
        // Remove otimista em caso de erro
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      }
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Header ── */}
      <div className="glass border-b border-white/8 px-4 py-3 flex items-center gap-3 shrink-0 z-10">
        <button
          type="button"
          onClick={() => router.push('/mensagens')}
          className="text-white/50 hover:text-white/80 transition"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        {/* Avatar */}
        {!isGroup && conv.otherUserAvatar ? (
          <Image
            src={conv.otherUserAvatar}
            alt={convName}
            width={36}
            height={36}
            style={{ width: 36, height: 36 }}
            className="rounded-full object-cover ring-1 ring-white/10 shrink-0"
          />
        ) : (
          <div className="h-9 w-9 rounded-full bg-secondary/15 grid place-items-center shrink-0">
            {isGroup
              ? <Trophy className="h-4 w-4 text-secondary/60" />
              : <User className="h-4 w-4 text-secondary" />
            }
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white/85 truncate">{convName}</p>
          {isGroup && (
            <span className="text-[10px] font-semibold text-secondary/60">Grupo do campeonato</span>
          )}
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-white/25">Nenhuma mensagem ainda.</p>
            <p className="text-xs text-white/15 mt-1">Diga olá! 👋</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const prev = messages[i - 1]
          const showSender = !prev || prev.senderId !== msg.senderId
          return (
            <Bubble
              key={msg.id}
              msg={msg}
              showSender={showSender}
              isGroup={isGroup}
            />
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="glass border-t border-white/8 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-end gap-2.5 shrink-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="Mensagem…"
          rows={1}
          className="flex-1 resize-none rounded-2xl bg-white/[0.07] ring-1 ring-white/10 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:ring-secondary/40 transition-shadow"
          style={{ minHeight: '40px', maxHeight: '100px' }}
        />
        <button
          type="button"
          disabled={!input.trim() || sending}
          onClick={() => void sendMessage()}
          className="h-10 w-10 rounded-full bg-secondary grid place-items-center text-primary transition active:scale-90 disabled:opacity-30 shrink-0"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
