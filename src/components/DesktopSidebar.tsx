'use client'

/**
 * DesktopSidebar — rail de navegação vertical (lg+). No mobile fica oculto
 * (a BottomNav assume). Espelha os itens da BottomNav com o mesmo estado neon.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Trophy, Swords, Users, MessageSquare, type LucideIcon } from 'lucide-react'
import { Logo } from './Logo'
import { UserAvatarMenu } from './UserAvatarMenu'
import { useUnreadCount } from '@/lib/use-unread-count'

interface Item {
  href: string
  label: string
  icon: LucideIcon
  matchPrefix?: boolean
}

const items: Item[] = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/campeonatos', label: 'Campeonatos', icon: Trophy, matchPrefix: true },
  { href: '/jogos', label: 'Desafios', icon: Swords, matchPrefix: true },
  { href: '/comunidade', label: 'Comunidade', icon: Users, matchPrefix: true },
  { href: '/mensagens', label: 'Mensagens', icon: MessageSquare, matchPrefix: true },
]

interface Props {
  name?: string | null
  avatarUrl?: string | null
  isAdmin?: boolean
  canManage?: boolean
  userId?: string | null
}

export function DesktopSidebar({ name, avatarUrl, isAdmin, canManage, userId }: Props) {
  const pathname = usePathname()
  const unread = useUnreadCount(userId ?? null)

  return (
    <aside className="hidden lg:flex sticky top-0 h-dvh w-[256px] shrink-0 flex-col gap-2 border-r border-white/8 px-4 py-6">
      {/* Logo + versão */}
      <div className="px-2 pb-4 space-y-1.5">
        <Link href="/" aria-label="Ir para a página inicial" className="inline-flex">
          <Logo />
        </Link>
        <Link
          href="/versao"
          className="block text-[11px] font-medium text-white/25 transition hover:text-white/50"
        >
          Beta 0.{process.env.NEXT_PUBLIC_COMMIT_COUNT ?? '?'}
        </Link>
      </div>

      {/* Navegação */}
      <nav className="flex flex-col gap-1.5">
        {items.map(({ href, label, icon: Icon, matchPrefix }) => {
          const active = matchPrefix ? pathname.startsWith(href) : pathname === href
          const showBadge = href === '/mensagens' && unread > 0
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition-all duration-200 ${
                active
                  ? 'bg-secondary text-primary shadow-[var(--shadow-neon)]'
                  : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.6 : 2} />
              <span className="flex-1 truncate">{label}</span>
              {showBadge && (
                <span
                  className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-black leading-none ${
                    active ? 'bg-primary text-secondary' : 'bg-secondary text-primary'
                  }`}
                >
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Perfil — fixado embaixo */}
      <div className="mt-auto flex items-center gap-3 rounded-2xl px-2 py-2">
        <UserAvatarMenu
          name={name}
          avatarUrl={avatarUrl}
          isAdmin={isAdmin}
          canManage={canManage}
          placement="up"
          align="left"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white/85">{name ?? 'Jogador'}</p>
          <p className="truncate text-[11px] text-white/35">
            {isAdmin ? 'Administrador' : canManage ? 'Professor' : 'Jogador'}
          </p>
        </div>
      </div>
    </aside>
  )
}
