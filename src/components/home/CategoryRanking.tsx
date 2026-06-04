'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { BarChart3, Crown, Info, Star, Trophy, User, X, Zap } from 'lucide-react'

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

function RankingInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden />

      {/* Sheet */}
      <div
        className="relative w-full max-w-sm rounded-t-3xl sm:rounded-3xl glass glass-card glass-overlay px-5 pb-8 pt-5 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="mx-auto h-1 w-10 rounded-full bg-white/20 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-white flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-secondary" />
            Como funciona o ranking
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-full bg-white/[0.07] text-white/50 transition hover:bg-white/[0.12] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Pontos por jogo */}
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">
            <Zap className="h-3 w-3" /> Pontos por partida
          </p>
          <div className="glass glass-card divide-y divide-white/[0.06] overflow-hidden text-sm">
            {[
              { label: 'Vitória', pts: '+2', color: 'text-secondary' },
              { label: 'Derrota', pts: '+1', color: 'text-white/55' },
              { label: 'Empate', pts: '+1 cada', color: 'text-white/55' },
            ].map(({ label, pts, color }) => (
              <div key={label} className="flex items-center justify-between px-3.5 py-2">
                <span className="text-white/70">{label}</span>
                <span className={`font-bold tabular-nums ${color}`}>{pts}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bônus campeonatos */}
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">
            <Trophy className="h-3 w-3" /> Bônus de campeonato encerrado
          </p>
          <div className="glass glass-card overflow-hidden text-sm">
            {/* Cabeçalho */}
            <div className="grid grid-cols-3 border-b border-white/8 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/30">
              <span>Posição</span>
              <span className="text-center">Normal</span>
              <span className="text-right">Oficial ⭐</span>
            </div>
            {[
              { label: 'Participar', normal: '—', official: '+5' },
              { label: '🥇 1º lugar', normal: '+5', official: '+15' },
              { label: '🥈 2º lugar', normal: '+3', official: '+10' },
              { label: '🥉 3º lugar', normal: '+1', official: '+5' },
            ].map(({ label, normal, official }) => (
              <div
                key={label}
                className="grid grid-cols-3 items-center border-b border-white/[0.05] px-3.5 py-2 last:border-0"
              >
                <span className="text-white/70">{label}</span>
                <span className="text-center font-semibold text-white/50">{normal}</span>
                <span className="text-right font-bold text-secondary">{official}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-white/30 leading-snug px-0.5">
            ⭐ Campeonatos oficiais são marcados pelo organizador ao criar o evento.
          </p>
        </div>

        {/* Desempate */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Desempate</p>
          <p className="text-[12px] text-white/45 leading-relaxed">
            Em caso de empate de pontos: saldo de sets &gt; número de vitórias.
          </p>
        </div>
      </div>
    </div>
  )
}

interface Props {
  rows: RankRow[]
}

export function CategoryRanking({ rows }: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null) // null = Geral
  const [showInfo, setShowInfo] = useState(false)

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
      {showInfo && <RankingInfoModal onClose={() => setShowInfo(false)} />}

      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-white">
        <BarChart3 className="h-5 w-5 text-secondary" />
        Ranking
      </h2>
      <button
        type="button"
        onClick={() => setShowInfo(true)}
        className="mb-3 flex items-center gap-1 text-[11px] font-medium text-secondary/70 transition hover:text-secondary"
      >
        <Info className="h-3 w-3" />
        Como são calculados os pontos?
      </button>

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
