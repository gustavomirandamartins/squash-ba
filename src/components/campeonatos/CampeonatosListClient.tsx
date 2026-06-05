'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Trophy, ChevronRight, GitBranch, Layers, Award } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ChampionshipListItem = {
  id: string
  name: string
  format: string
  status: string
  is_official?: boolean
}

type Props = {
  championships: ChampionshipListItem[]
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  rascunho:  { label: 'Rascunho',  className: 'bg-white/8 text-white/45' },
  ativo:     { label: 'Ativo',     className: 'bg-secondary/20 text-secondary' },
  encerrado: { label: 'Encerrado', className: 'bg-white/5 text-white/30' },
}

// Oficiais em rascunho = inscrições abertas (label próprio)
const OFFICIAL_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  rascunho:  { label: 'Inscrições abertas', className: 'bg-cane/20 text-cane' },
  ativo:     { label: 'Em andamento',       className: 'bg-cane/20 text-cane' },
  encerrado: { label: 'Encerrado',          className: 'bg-white/5 text-white/30' },
}

const FORMAT_LABEL: Record<string, string> = {
  liga:        'Liga',
  grupos_elim: 'Grupos + Eliminatórias',
  eliminatoria:'Eliminatórias',
  desafio:     'Desafio',
}

const FORMAT_ICON: Record<string, ReactNode> = {
  eliminatoria: <GitBranch  className="h-[18px] w-[18px] shrink-0 text-orange-400/60" />,
  grupos_elim:  <Layers     className="h-[18px] w-[18px] shrink-0 text-purple-400/60" />,
}

// Filter pill options (null = all)
const FILTER_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'Todos',          value: null          },
  { label: 'Liga',           value: 'liga'        },
  { label: 'Grupos + Elim.', value: 'grupos_elim' },
  { label: 'Eliminatória',   value: 'eliminatoria'},
]

// ─── Card ─────────────────────────────────────────────────────────────────────

function ChampCard({ c }: { c: ChampionshipListItem }) {
  const official = !!c.is_official
  const badge = official
    ? OFFICIAL_STATUS_BADGE[c.status] ?? OFFICIAL_STATUS_BADGE.rascunho
    : STATUS_BADGE[c.status] ?? STATUS_BADGE.rascunho
  const formatIcon = FORMAT_ICON[c.format]

  return (
    <Link
      href={`/campeonatos/${c.id}`}
      className={`glass glass-card flex items-center gap-3 px-4 py-3 transition active:scale-[0.98] ${
        official ? 'glass-official' : ''
      }`}
    >
      {/* Ícone: oficial usa troféu verde; senão ícone do formato ou troféu */}
      {official ? (
        <div className="h-8 w-8 rounded-xl grid place-items-center shrink-0 bg-cane/15">
          <Award className="h-[18px] w-[18px] shrink-0 text-cane" />
        </div>
      ) : formatIcon ? (
        <div className="h-8 w-8 rounded-xl grid place-items-center shrink-0 bg-white/5">
          {formatIcon}
        </div>
      ) : (
        <Trophy className="h-5 w-5 shrink-0 text-secondary/50" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/90">{c.name}</p>
        <p className="text-xs text-white/40">{FORMAT_LABEL[c.format] ?? c.format}</p>
      </div>

      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badge.className}`}>
        {badge.label}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/20" />
    </Link>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CampeonatosListClient({ championships }: Props) {
  const [activeFormat, setActiveFormat] = useState<string | null>(null)

  const officials = championships.filter((c) => c.is_official)
  const regular = championships.filter((c) => !c.is_official)

  const filtered = activeFormat
    ? regular.filter((c) => c.format === activeFormat)
    : regular

  return (
    <div className="space-y-5">
      {/* ── Seção Oficiais (verde-cana) ─────────────────────────────────── */}
      {officials.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Award className="h-4 w-4 shrink-0 text-cane" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-cane shrink-0">
              Oficiais
            </p>
            <div className="h-px flex-1 bg-cane/15" />
          </div>
          <div className="space-y-2">
            {officials.map((c) => (
              <ChampCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      {/* ── Demais campeonatos ───────────────────────────────────────────── */}
      <div className="space-y-3">
        {officials.length > 0 && (
          <div className="flex items-center gap-3 px-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 shrink-0">
              Comunidade
            </p>
            <div className="flex-1 h-px bg-white/8" />
          </div>
        )}

        {/* Filtro de formato */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide -mx-1 px-1">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = activeFormat === opt.value
            return (
              <button
                key={opt.label}
                onClick={() => setActiveFormat(opt.value)}
                className={[
                  'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200',
                  isActive
                    ? 'bg-secondary text-primary shadow-sm'
                    : 'glass glass-pill text-white/50 hover:text-white/75',
                ].join(' ')}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="glass glass-card px-4 py-10 text-center">
            <p className="text-sm text-white/30">Nenhum campeonato neste formato.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <ChampCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
