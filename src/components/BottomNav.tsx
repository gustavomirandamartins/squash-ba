'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Trophy, Store, Users, MessageSquare, type LucideIcon } from 'lucide-react'
import { useUnreadCount } from '@/lib/use-unread-count'
import { useIsDesktop } from '@/lib/use-is-desktop'

interface Item {
  href: string
  label: string
  icon: LucideIcon
  matchPrefix?: boolean
}

const items: Item[] = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/campeonatos', label: 'Campeonatos', icon: Trophy, matchPrefix: true },
  { href: '/marketplace', label: 'Marketplace', icon: Store, matchPrefix: true },
  { href: '/comunidade', label: 'Comunidade', icon: Users, matchPrefix: true },
  { href: '/mensagens', label: 'Mensagens', icon: MessageSquare, matchPrefix: true },
]

interface Props {
  userId?: string | null
}

export function BottomNav({ userId }: Props) {
  const pathname = usePathname()
  // No desktop a BottomNav fica oculta e o contador roda na DesktopSidebar.
  const isDesktop = useIsDesktop() === true
  const unread = useUnreadCount(isDesktop ? null : userId ?? null)

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] landscape-sm:inset-x-auto landscape-sm:inset-y-0 landscape-sm:left-0 landscape-sm:items-center landscape-sm:pb-0 landscape-sm:pl-[max(0.5rem,env(safe-area-inset-left))] lg:hidden">
      <div className="pointer-events-auto glass glass-overlay glass-pill flex items-center gap-0.5 px-2 py-2.5 landscape-sm:flex-col landscape-sm:gap-0.5 landscape-sm:px-2 landscape-sm:py-2">
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
              className={`relative grid h-12 w-12 place-items-center rounded-full transition-all duration-200 active:scale-90 landscape-sm:h-10 landscape-sm:w-10 ${
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
