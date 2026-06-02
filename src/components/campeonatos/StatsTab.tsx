'use client'

/**
 * StatsTab — estatísticas do campeonato.
 * Reutiliza os dados de get_standings (já carregados) e computa métricas derivadas.
 * Exibe: Aproveitamento, Melhor saldo de pontos, Mais vitórias, mais eficiente em sets.
 */

import { useMemo } from 'react'
import Image from 'next/image'
import { User, TrendingUp, Swords, Target, BarChart2 } from 'lucide-react'
import type { Standing } from './StandingsTable'
import type { ParticipantInfo } from './ChampionshipDetailClient'
import { useOfflineStandings, type OfflineStandingsInput } from '@/lib/standings/use-offline-standings'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Props = {
  standings: Standing[]
  participantInfo: Record<string, ParticipantInfo>
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  /** dados p/ recomputar offline ao vivo (opcional) */
  offlineData?: OfflineStandingsInput
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(v: number, total: number): string {
  if (total === 0) return '—'
  return `${Math.round((v / total) * 100)}%`
}

function bar(ratio: number) {
  const w = Math.min(Math.max(Math.round(ratio * 100), 0), 100)
  return (
    <div className="h-1 w-full bg-white/8 rounded-full overflow-hidden mt-1">
      <div
        className="h-full bg-secondary/60 rounded-full transition-all"
        style={{ width: `${w}%` }}
      />
    </div>
  )
}

// ─── PlayerRow ────────────────────────────────────────────────────────────────

function PlayerRow({
  pos,
  name,
  avatarUrl,
  primary,
  secondary,
  barRatio,
}: {
  pos: number
  name: string | null
  avatarUrl: string | null
  primary: string
  secondary: string
  barRatio: number
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      <span className="w-5 text-center text-[11px] text-white/25 shrink-0">{pos}</span>
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={name ?? ''}
          width={26}
          height={26}
          style={{ width: 26, height: 26 }}
          className="rounded-full object-cover shrink-0 ring-1 ring-white/10"
        />
      ) : (
        <div className="h-[26px] w-[26px] rounded-full bg-secondary/10 grid place-items-center shrink-0">
          <User className="h-[13px] w-[13px] text-secondary/40" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-white/80 truncate">{name ?? '—'}</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-secondary tabular-nums">{primary}</span>
            <span className="text-[10px] text-white/30 tabular-nums">{secondary}</span>
          </div>
        </div>
        {bar(barRatio)}
      </div>
    </div>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="glass glass-card px-4 py-3.5 space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-lg bg-secondary/10 grid place-items-center text-secondary shrink-0">
          {icon}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/35">
          {label}
        </p>
      </div>
      {children}
    </div>
  )
}

// ─── StatsTab ─────────────────────────────────────────────────────────────────

export function StatsTab({ standings: onlineStandings, participantInfo, pointsWin, pointsDraw, pointsLoss, offlineData }: Props) {
  const off = useOfflineStandings(offlineData)
  const standings = off.offline && off.standings ? off.standings : onlineStandings

  const rows = useMemo(() => {
    return standings
      .map((s) => {
        const totalGames = s.v + s.e + s.d
        const totalSets  = s.sets_ganhos + s.sets_perdidos + s.sets_empatados
        const maxPoints  = totalGames * pointsWin
        const aproveitamento = maxPoints > 0
          ? s.pontos / maxPoints
          : 0
        const setRatio = totalSets > 0 ? s.sets_ganhos / totalSets : 0
        return {
          ...s,
          totalGames,
          totalSets,
          aproveitamento,
          setRatio,
          info: participantInfo[s.participant_id] ?? { full_name: s.display_name, avatar_url: null },
        }
      })
  }, [standings, participantInfo, pointsWin])

  if (rows.length === 0) {
    return (
      <div className="glass glass-card px-4 py-14 text-center space-y-1.5">
        <BarChart2 className="h-8 w-8 text-white/15 mx-auto" />
        <p className="text-sm font-medium text-white/35 mt-2">Sem dados ainda</p>
        <p className="text-xs text-white/20 leading-relaxed max-w-xs mx-auto">
          As estatísticas aparecerão conforme as partidas forem sendo finalizadas.
        </p>
      </div>
    )
  }

  // Calcular máximos para normalizar as barras
  const maxAprov  = Math.max(...rows.map((r) => r.aproveitamento), 0.001)
  const maxV      = Math.max(...rows.map((r) => r.v), 1)
  const maxSaldo  = Math.max(...rows.map((r) => r.saldo_pontos), 1)
  const maxSetR   = Math.max(...rows.map((r) => r.setRatio), 0.001)

  // Rankings por métrica (top 5)
  const byAprov   = [...rows].sort((a, b) => b.aproveitamento - a.aproveitamento).slice(0, 5)
  const byWins    = [...rows].sort((a, b) => b.v - a.v || b.pontos - a.pontos).slice(0, 5)
  const bySaldo   = [...rows].sort((a, b) => b.saldo_pontos - a.saldo_pontos).slice(0, 5)
  const bySetR    = [...rows].sort((a, b) => b.setRatio - a.setRatio || b.sets_ganhos - a.sets_ganhos).slice(0, 5)

  return (
    <div className="space-y-3">
      {/* Resumo global */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Jogadores', val: rows.length },
          { label: 'Partidas', val: rows.reduce((s, r) => s + r.totalGames, 0) / 2 | 0 },
          { label: 'Sets jogados', val: rows.reduce((s, r) => s + r.totalSets, 0) / 2 | 0 },
        ].map(({ label, val }) => (
          <div key={label} className="glass glass-card px-3 py-3 text-center">
            <p className="text-lg font-black text-secondary tabular-nums">{val}</p>
            <p className="text-[10px] text-white/30 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Aproveitamento */}
      <StatCard
        icon={<TrendingUp className="h-3.5 w-3.5" />}
        label="Aproveitamento"
      >
        {byAprov.map((r, i) => (
          <PlayerRow
            key={r.participant_id}
            pos={i + 1}
            name={r.display_name}
            avatarUrl={r.info.avatar_url}
            primary={pct(r.aproveitamento, 1)}
            secondary={`${r.v}V ${r.e}E ${r.d}D`}
            barRatio={r.aproveitamento / maxAprov}
          />
        ))}
      </StatCard>

      {/* Mais vitórias */}
      <StatCard
        icon={<Swords className="h-3.5 w-3.5" />}
        label="Mais vitórias"
      >
        {byWins.map((r, i) => (
          <PlayerRow
            key={r.participant_id}
            pos={i + 1}
            name={r.display_name}
            avatarUrl={r.info.avatar_url}
            primary={String(r.v)}
            secondary={`${r.pontos} pts`}
            barRatio={r.v / maxV}
          />
        ))}
      </StatCard>

      {/* Melhor saldo de pontos */}
      <StatCard
        icon={<Target className="h-3.5 w-3.5" />}
        label="Melhor saldo de pontos"
      >
        {bySaldo.map((r, i) => (
          <PlayerRow
            key={r.participant_id}
            pos={i + 1}
            name={r.display_name}
            avatarUrl={r.info.avatar_url}
            primary={`${r.saldo_pontos > 0 ? '+' : ''}${r.saldo_pontos}`}
            secondary={`${r.pontos_favor}F ${r.pontos_contra}C`}
            barRatio={Math.max(r.saldo_pontos, 0) / maxSaldo}
          />
        ))}
      </StatCard>

      {/* Eficiência em sets */}
      <StatCard
        icon={<BarChart2 className="h-3.5 w-3.5" />}
        label="Eficiência em sets"
      >
        {bySetR.map((r, i) => (
          <PlayerRow
            key={r.participant_id}
            pos={i + 1}
            name={r.display_name}
            avatarUrl={r.info.avatar_url}
            primary={pct(r.setRatio, 1)}
            secondary={`${r.sets_ganhos}G ${r.sets_perdidos}P`}
            barRatio={r.setRatio / maxSetR}
          />
        ))}
      </StatCard>

      <p className="text-[10px] text-white/15 px-1 leading-relaxed">
        Aproveitamento = pontos obtidos / pontos possíveis · atualizado em tempo real.
      </p>
    </div>
  )
}
