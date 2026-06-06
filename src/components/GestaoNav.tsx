'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings2 } from 'lucide-react'

const TABS_BASE = [
  { label: 'Categorias', href: '/gestao/categorias' },
  { label: 'Locais', href: '/gestao/locais' },
  { label: 'Times', href: '/gestao/times' },
]

// Anúncios e Feedbacks foram movidos para o Painel admin (/admin).
export function GestaoNav() {
  const pathname = usePathname()
  const tabs = TABS_BASE

  return (
    <div>
      <div className="px-5 pt-4 pb-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <Settings2 className="h-5 w-5 text-secondary" />
          Gestão
        </h2>
      </div>
      <nav className="flex gap-2 overflow-x-auto no-scrollbar border-b border-white/8 px-5 pb-3">
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
    </div>
  )
}
