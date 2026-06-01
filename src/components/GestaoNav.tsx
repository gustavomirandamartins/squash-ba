'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS_BASE = [
  { label: 'Categorias', href: '/gestao/categorias' },
  { label: 'Locais', href: '/gestao/locais' },
  { label: 'Times', href: '/gestao/times' },
]
const TABS_ADMIN = [
  { label: 'Anúncios', href: '/gestao/anuncios' },
  { label: 'Feedbacks', href: '/gestao/feedbacks' },
]

export function GestaoNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  const tabs = isAdmin ? [...TABS_BASE, ...TABS_ADMIN] : TABS_BASE

  return (
    <nav className="flex gap-2 overflow-x-auto no-scrollbar border-b border-white/8 px-5 pb-3 pt-4">
      {tabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 ${
              isActive
                ? 'bg-secondary text-primary'
                : 'bg-white/8 text-white/65 hover:bg-white/12 hover:text-white'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
