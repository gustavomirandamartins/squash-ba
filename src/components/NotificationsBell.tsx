'use client'

/**
 * NotificationsBell — central de notificações in-app (#15).
 * Busca as notificações do usuário, assina Realtime para novas e mostra um
 * sininho com badge. Clicar marca como lida e navega; há "marcar todas".
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell, MessageSquare, Swords, Trophy, GraduationCap, MessageSquareWarning, Check, type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { onAppReturn } from '@/lib/on-app-return'

type Notification = {
  id: string
  type: string
  title: string
  body: string | null
  url: string | null
  read: boolean
  created_at: string
}

const ICONS: Record<string, LucideIcon> = {
  mensagem: MessageSquare,
  desafio_convite: Swords,
  desafio_aceito: Swords,
  campeonato: Trophy,
  feedback: MessageSquareWarning,
  professor: GraduationCap,
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

export function NotificationsBell({
  userId,
  className = '',
  openUp = false,
  openRight = false,
}: {
  userId: string | null
  className?: string
  openUp?: boolean
  /** Abre o painel para a direita (left-0). Use quando o sino está no canto esquerdo da tela. */
  openRight?: boolean
}) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const unread = items.filter((n) => !n.read).length

  const fetchItems = useCallback(async () => {
    if (!userId) { setItems([]); return }
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, url, read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setItems(data as Notification[])
  }, [supabase, userId])

  useEffect(() => { void fetchItems() }, [fetchItems])

  // Realtime: novas notificações do usuário
  useEffect(() => {
    if (!userId) return
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    async function setup() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token)
      if (cancelled) return
      channel = supabase
        .channel(`notifications-${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          (payload) => setItems((prev) => [payload.new as Notification, ...prev].slice(0, 30)),
        )
        .subscribe()
    }
    void setup()
    // Volta ao app: recarrega no máximo a cada 30 s (o tempo real cobre o resto).
    const stopReturn = onAppReturn(() => void fetchItems())
    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
      stopReturn()
    }
  }, [supabase, userId, fetchItems])

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function markAllRead() {
    if (!userId || unread === 0) return
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
  }

  async function handleClick(n: Notification) {
    setOpen(false)
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      await supabase.from('notifications').update({ read: true }).eq('id', n.id)
    }
    if (n.url) router.push(n.url)
  }

  if (!userId) return null

  return (
    <div ref={panelRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notificações"
        className="relative grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-white/70 transition hover:bg-white/[0.1] hover:text-white active:scale-90"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-secondary px-1 text-[9px] font-black text-primary">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute z-50 w-[300px] max-w-[calc(100vw-2rem)] glass glass-card glass-overlay overflow-hidden ${openRight ? 'left-0' : 'right-0'} ${openUp ? 'bottom-full mb-2' : 'mt-2'}`}>
          <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2.5">
            <p className="text-xs font-bold text-white">Notificações</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="flex items-center gap-1 text-[11px] font-semibold text-secondary transition hover:text-secondary/80"
              >
                <Check className="h-3 w-3" /> Marcar lidas
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto h-7 w-7 text-white/15" />
                <p className="mt-2 text-xs text-white/35">Nenhuma notificação ainda.</p>
              </div>
            ) : (
              items.map((n) => {
                const Icon = ICONS[n.type] ?? Bell
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void handleClick(n)}
                    className={`flex w-full items-start gap-2.5 border-b border-white/5 px-3.5 py-2.5 text-left transition hover:bg-white/[0.05] ${
                      n.read ? '' : 'bg-secondary/[0.06]'
                    }`}
                  >
                    <div className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${n.read ? 'bg-white/8' : 'bg-secondary/15'}`}>
                      <Icon className={`h-3.5 w-3.5 ${n.read ? 'text-white/40' : 'text-secondary'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className={`truncate text-xs font-semibold ${n.read ? 'text-white/70' : 'text-white'}`}>
                          {n.title}
                        </p>
                        {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />}
                      </div>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/45">{n.body}</p>}
                      <p className="mt-0.5 text-[10px] text-white/25">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
