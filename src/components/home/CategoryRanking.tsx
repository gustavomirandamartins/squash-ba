'use client'

import { useState } from 'react'
import Image from 'next/image'
import { BarChart3, Crown, User } from 'lucide-react'

export interface RankRow {
  user_id: string
  full_name: string | null
  avatar_url: string | null
  points: number
  wins: number
  played: number
  rank: number
}

export interface RankCategory {
  id: string
  name: string
  rows: RankRow[]
}

export function CategoryRanking({ categories }: { categories: RankCategory[] }) {
  const [active, setActive] = useState(0)

  if (categories.length === 0) return null

  const current = categories[active] ?? categories[0]

  return (
    <section className="px-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-white">
        <BarChart3 className="h-5 w-5 text-secondary" />
        Ranking por categoria
      </h2>
      <p className="mb-3 text-[11px] text-white/35">
        Pontos: final 10 · semi 5 · campeonato 3 · desafio 2 · empate 1
      </p>

      {/* Abas */}
      <div className="no-scrollbar -mx-5 mb-3 flex gap-2 overflow-x-auto px-5">
        {categories.map((c, i) => {
          const isActive = i === active
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(i)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? 'bg-secondary text-primary'
                  : 'bg-white/[0.06] text-white/55 hover:text-white/80'
              }`}
            >
              {c.name}
            </button>
          )
        })}
      </div>

      {/* Tabela */}
      <div className="glass glass-card divide-y divide-white/[0.06] overflow-hidden">
        {current.rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-white/35">Sem jogos computados nesta categoria.</p>
        ) : (
          current.rows.map((r) => (
            <div key={r.user_id} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                  r.rank === 1
                    ? 'bg-secondary text-primary'
                    : 'bg-white/[0.07] text-white/60'
                }`}
              >
                {r.rank === 1 ? <Crown className="h-3.5 w-3.5" /> : r.rank}
              </span>
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
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white/85">{r.full_name ?? 'Jogador'}</p>
                <p className="text-[11px] text-white/35">
                  {r.wins} {r.wins === 1 ? 'vitória' : 'vitórias'} · {r.played}{' '}
                  {r.played === 1 ? 'jogo' : 'jogos'}
                </p>
              </div>
              <span className="shrink-0 text-right">
                <span className="font-display text-base font-extrabold text-secondary">{r.points}</span>
                <span className="ml-1 text-[10px] font-medium text-white/35">pts</span>
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
