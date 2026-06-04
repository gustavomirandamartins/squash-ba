'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { BarChart3, Crown, Star, User } from 'lucide-react'

export interface RankRow {
  user_id: string
  full_name: string | null
  avatar_url: string | null
  category_id: string | null
  category_name: string | null
  points: number
  game_points: number
  bonus_points: number
  wins: number
  losses: number
  played: number
  set_balance: number
  rank: number // posição geral (do servidor)
}

interface Props {
  rows: RankRow[]
}

export function CategoryRanking({ rows }: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null) // null = Geral

  // Deriva categorias únicas (na ordem de aparição no ranking geral)
  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows) {
      if (r.category_id && r.category_name && !seen.has(r.category_id)) {
        seen.set(r.category_id, r.category_name)
      }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [rows])

  // Filtra e re-numera posições para a categoria selecionada
  const displayRows = useMemo(() => {
    if (!activeCategory) return rows // Geral: posições do servidor
    return rows
      .filter((r) => r.category_id === activeCategory)
      .map((r, i) => ({ ...r, rank: i + 1 }))
  }, [rows, activeCategory])

  if (rows.length === 0) return null

  return (
    <section className="px-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-white">
        <BarChart3 className="h-5 w-5 text-secondary" />
        Ranking
      </h2>
      <p className="mb-3 text-[11px] text-white/35">
        Vitória +2 pts · Derrota +1 pt · Empate +1 cada · Pódio e participação em campeonatos somam bônus
      </p>

      {/* Abas: Geral + categorias */}
      <div className="no-scrollbar -mx-5 mb-3 flex gap-2 overflow-x-auto px-5">
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            activeCategory === null
              ? 'bg-secondary text-primary'
              : 'bg-white/[0.06] text-white/55 hover:text-white/80'
          }`}
        >
          Geral
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveCategory(c.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              activeCategory === c.id
                ? 'bg-secondary text-primary'
                : 'bg-white/[0.06] text-white/55 hover:text-white/80'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="glass glass-card divide-y divide-white/[0.06] overflow-hidden">
        {displayRows.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-white/35">
            Nenhuma partida computada nesta categoria.
          </p>
        ) : (
          displayRows.map((r) => (
            <div key={r.user_id} className="flex items-center gap-3 px-4 py-2.5">
              {/* Posição */}
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                  r.rank === 1
                    ? 'bg-secondary text-primary'
                    : r.rank === 2
                      ? 'bg-white/20 text-white'
                      : r.rank === 3
                        ? 'bg-white/12 text-white/70'
                        : 'bg-white/[0.07] text-white/50'
                }`}
              >
                {r.rank === 1 ? <Crown className="h-3.5 w-3.5" /> : r.rank}
              </span>

              {/* Avatar */}
              {r.avatar_url ? (
                <Image
                  src={r.avatar_url}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                />
              ) : (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary/15">
                  <User className="h-4 w-4 text-secondary" />
                </span>
              )}

              {/* Nome + stats */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white/85">
                  {r.full_name ?? 'Jogador'}
                </p>
                <p className="text-[11px] text-white/35">
                  {r.wins}V · {r.losses}D · {r.played}{' '}
                  {r.played === 1 ? 'jogo' : 'jogos'}
                  {r.bonus_points > 0 && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-secondary/70">
                      <Star className="h-2.5 w-2.5" />
                      +{r.bonus_points} bônus
                    </span>
                  )}
                </p>
              </div>

              {/* Pontos */}
              <span className="shrink-0 text-right">
                <span className="font-display text-base font-extrabold text-secondary">
                  {r.points}
                </span>
                <span className="ml-1 text-[10px] font-medium text-white/35">pts</span>
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
