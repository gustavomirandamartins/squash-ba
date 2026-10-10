'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: 'Denúncias',   href: '/admin/denuncias'   },
  { label: 'Usuários',    href: '/admin/usuarios'    },
  { label: 'Professores', href: '/admin/professores' },
  { label: 'Anúncios',   href: '/admin/anuncios'    },
  { label: 'Banners',    href: '/admin/banners'     },
  { label: 'Feedbacks',  href: '/admin/feedbacks'   },
]

export function AdminNav({ feedbackCount, reportCount }: { feedbackCount: number; reportCount: number }) {
  const pathname = usePathname()

  return (
    <nav className="flex gap-2 overflow-x-auto no-scrollbar border-b border-white/8 pb-3">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
        const count =
          tab.href === '/admin/feedbacks' ? feedbackCount : tab.href === '/admin/denuncias' ? reportCount : 0
        const badge = count > 0

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 ${
              isActive
                ? 'bg-secondary text-primary'
                : 'bg-white/8 text-white/65 hover:bg-white/12 hover:text-white'
            }`}
          >
            {tab.label}
            {badge && (
              <span
                className={`absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-black ${
                  isActive ? 'bg-primary text-secondary' : 'bg-secondary text-primary'
                }`}
              >
                {count > 9 ? '9+' : count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
