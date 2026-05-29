'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, CalendarDays, Play, MessageSquare, type LucideIcon } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

interface Item {
  href: string
  label: string
  icon: LucideIcon
  matchPrefix?: boolean
}

const items: Item[] = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/campeonatos', label: 'Campeonatos', icon: CalendarDays, matchPrefix: true },
  { href: '/jogos', label: 'Jogos', icon: Play, matchPrefix: true },
  { href: '/mensagens', label: 'Mensagens', icon: MessageSquare, matchPrefix: true },
]

// ── Hook: total de mensagens não-lidas ────────────────────────────────────────

function useUnreadCount(userId: string | null) {
  const [count, setCount] = useState(0)
  const [supabase] = useState(() => createClient())

  const fetchCount = async () => {
    if (!userId) { setCount(0); return }

    // Busca memberships
    const { data: memberships } = await supabase
      .from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', userId)

    if (!memberships?.length) { setCount(0); return }

    let total = 0
    await Promise.all(
      memberships.map(async (m: { conversation_id: string; last_read_at: string | null }) => {
        const since = m.last_read_at ?? new Date(0).toISOString()
        const { count: c } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', m.conversation_id)
          .neq('sender_id', userId)
          .gt('created_at', since)
        total += c ?? 0
      }),
    )
    setCount(total)
  }

  useEffect(() => {
    void fetchCount()

    // Atualiza ao receber qualquer mensagem nova
    const ch = supabase
      .channel('bottom-nav-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        void fetchCount()
      })
      .subscribe()

    // Atualiza ao retornar ao foco
    const onFocus = () => void fetchCount()
    window.addEventListener('focus', onFocus)

    return () => {
      void supabase.removeChannel(ch)
      window.removeEventListener('focus', onFocus)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  return count
}

// ── BottomNav ─────────────────────────────────────────────────────────────────

interface Props {
  userId?: string | null
}

export function BottomNav({ userId }: Props) {
  const pathname = usePathname()
  const unread = useUnreadCount(userId ?? null)

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto glass glass-pill flex items-center gap-1 px-2.5 py-2.5">
        {items.map(({ href, label, icon: Icon, matchPrefix }) => {
          const active = matchPrefix ? pathname.startsWith(href) : pathname === href
          const isMensagens = href === '/mensagens'
          const showBadge = isMensagens && unread > 0

          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`relative grid h-12 w-12 place-items-center rounded-full transition-all duration-200 active:scale-90 ${
                active
                  ? 'bg-secondary text-primary shadow-[var(--shadow-neon)]'
                  : 'text-white/65 hover:text-white'
              }`}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.6 : 2} />
              {showBadge && !active && (
                <span className="absolute top-1.5 right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-secondary text-primary text-[9px] font-black grid place-items-center leading-none">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
