'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Search, X, User, GraduationCap, ChevronRight } from 'lucide-react'

export type CommunityUser = {
  id: string
  name: string | null
  avatarUrl: string | null
  categoryId: string | null
  category: string | null
  team: string | null
  isProfessor: boolean
}

type Category = { id: string; name: string }

export function ComunidadeClient({
  users,
  categories,
}: {
  users: CommunityUser[]
  categories: Category[]
}) {
  const [query, setQuery] = useState('')
  const [catFilter, setCatFilter] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (catFilter && u.categoryId !== catFilter) return false
      if (q && !(u.name ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [users, query, catFilter])

  return (
    <div className="space-y-3">
      {/* Busca */}
      <div className="glass glass-card flex items-center gap-2 px-3.5 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar jogador por nome…"
          className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')}>
            <X className="h-4 w-4 text-white/40" />
          </button>
        )}
      </div>

      {/* Filtro por categoria */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide -mx-1 px-1">
          <button
            onClick={() => setCatFilter(null)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              catFilter === null
                ? 'bg-secondary text-primary'
                : 'glass glass-pill text-white/50 hover:text-white/75'
            }`}
          >
            Todas
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCatFilter(c.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                catFilter === c.id
                  ? 'bg-secondary text-primary'
                  : 'glass glass-pill text-white/50 hover:text-white/75'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="glass glass-card px-4 py-10 text-center text-sm text-white/35">
          Nenhum jogador encontrado.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <Link
              key={u.id}
              href={`/jogador/${u.id}?from=comunidade`}
              className="glass glass-card flex items-center gap-3 px-4 py-3 transition active:scale-[0.98]"
            >
              {/* Avatar */}
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10">
                {u.avatarUrl ? (
                  <Image src={u.avatarUrl} alt={u.name ?? ''} fill className="object-cover" unoptimized />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-secondary/10">
                    <User className="h-4 w-4 text-secondary/50" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-white/90">{u.name ?? 'Jogador'}</p>
                  {u.isProfessor && (
                    <span className="flex items-center gap-1 rounded-full bg-secondary/15 px-1.5 py-0.5 text-[9px] font-bold text-secondary shrink-0">
                      <GraduationCap className="h-2.5 w-2.5" /> Professor
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-white/40 mt-0.5">
                  {[u.category, u.team].filter(Boolean).join(' · ') || 'Jogador'}
                </p>
              </div>

              <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
