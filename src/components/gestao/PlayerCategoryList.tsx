'use client'

import { useState, useMemo, useTransition } from 'react'
import Image from 'next/image'
import { Search, User, X, Check, AlertTriangle } from 'lucide-react'
import { updatePlayerCategory } from '@/app/(app)/gestao/jogadores/actions'

export type PlayerRow = {
  id: string
  name: string | null
  avatarUrl: string | null
  categoryId: string | null
}

export type CategoryOption = {
  id: string
  name: string
}

export function PlayerCategoryList({
  players,
  categories,
}: {
  players: PlayerRow[]
  categories: CategoryOption[]
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return players
    return players.filter((p) => (p.name ?? '').toLowerCase().includes(q))
  }, [players, query])

  return (
    <div className="space-y-3">
      {/* Busca */}
      <div className="flex items-center gap-2 rounded-2xl bg-white/[0.06] px-3.5 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-white/35" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar jogador…"
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Limpar">
            <X className="h-4 w-4 text-white/35" />
          </button>
        )}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="glass glass-card px-4 py-8 text-center text-sm text-white/40">
          Nenhum jogador encontrado.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => (
            <PlayerItem key={p.id} player={p} categories={categories} />
          ))}
        </ul>
      )}
    </div>
  )
}

function PlayerItem({
  player,
  categories,
}: {
  player: PlayerRow
  categories: CategoryOption[]
}) {
  const [categoryId, setCategoryId] = useState(player.categoryId ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    setCategoryId(next)
    setSaved(false)
    setError(null)

    startTransition(async () => {
      const res = await updatePlayerCategory(player.id, next || null)
      if (res.error) {
        setError(res.error)
        setCategoryId(player.categoryId ?? '')
      } else {
        setSaved(true)
        // apaga o tick após 2 s
        setTimeout(() => setSaved(false), 2000)
      }
    })
  }

  return (
    <li className="glass glass-card flex items-center gap-3 px-3.5 py-3">
      {/* Avatar */}
      {player.avatarUrl ? (
        <Image
          src={player.avatarUrl}
          alt={player.name ?? ''}
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
        />
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/8">
          <User className="h-4 w-4 text-white/40" />
        </span>
      )}

      {/* Nome */}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/85">
        {player.name ?? 'Jogador'}
      </span>

      {/* Feedback */}
      {saved && <Check className="h-4 w-4 shrink-0 text-secondary" />}
      {error && (
        <span title={error}>
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
        </span>
      )}

      {/* Select de categoria */}
      <select
        value={categoryId}
        onChange={handleChange}
        disabled={pending}
        className="h-8 rounded-xl border border-white/10 bg-white/[0.06] px-2.5 text-xs font-semibold text-white/80 outline-none transition focus:border-secondary/50 disabled:opacity-50"
        aria-label={`Categoria de ${player.name ?? 'jogador'}`}
      >
        <option value="" className="bg-[#1d2b45]">
          — sem categoria —
        </option>
        {categories.map((c) => (
          <option key={c.id} value={c.id} className="bg-[#1d2b45]">
            {c.name}
          </option>
        ))}
      </select>
    </li>
  )
}
