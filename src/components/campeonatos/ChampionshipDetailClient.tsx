'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Trophy, User } from 'lucide-react'
import { StandingsTable, type Standing } from './StandingsTable'

// ─── Tipos exportados (reutilizados em page.tsx) ──────────────────────────────

export type { Standing }

export type GameScore = {
  game_number: number
  score_a: number
  score_b: number
}

export type Match = {
  id: string
  round: number
  result: string | null
  status: string
  side_a_participant_id: string | null
  side_b_participant_id: string | null
  match_games: GameScore[]
}

export type Stage = {
  id: string
  counting: string
  rounds: number
  sets_to_play: number
  points_per_set: number
  win_by_two: boolean
  set_draw_enabled: boolean
  time_minutes: number | null
}

export type ChampData = {
  id: string
  name: string
  format: string
  unit: string
  status: string
  allow_draw: boolean
  points_win: number
  points_draw: number
  points_loss: number
  tiebreakers: string[]
  created_by: string
}

export type ParticipantInfo = {
  full_name: string | null
  avatar_url: string | null
}

type Props = {
  champ: ChampData
  stage: Stage | null
  matches: Match[]
  participantInfo: Record<string, ParticipantInfo>
  canManage: boolean
  // Classificação
  initialStandings: Standing[]
  currentUserParticipantId: string | null
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const FORMAT_LABEL: Record<string, string> = {
  liga: 'Liga',
  grupos_elim: 'Grupos + Eliminatórias',
  eliminatoria: 'Eliminatórias',
  desafio: 'Desafio',
}

const UNIT_LABEL: Record<string, string> = {
  player: 'Jogador',
  pair: 'Dupla',
  team: 'Time',
}

const CHAMP_STATUS: Record<string, { label: string; cls: string }> = {
  rascunho: { label: 'Rascunho', cls: 'bg-white/8 text-white/45' },
  ativo:    { label: 'Ativo',    cls: 'bg-secondary/20 text-secondary' },
  encerrado:{ label: 'Encerrado',cls: 'bg-white/5 text-white/30' },
}

const MATCH_STATUS: Record<string, { label: string; cls: string; dot?: boolean }> = {
  agendado:     { label: 'A realizar', cls: 'text-white/30' },
  em_andamento: { label: 'Ao vivo',    cls: 'text-secondary', dot: true },
  finalizado:   { label: 'Encerrado',  cls: 'text-white/35' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countSets(
  games: GameScore[],
  stage: Stage | null,
): { a: number; b: number } | null {
  if (!games.length || !stage) return null
  if (stage.counting === 'tempo') {
    const g = games[0]
    return g ? { a: g.score_a, b: g.score_b } : null
  }
  const P = stage.points_per_set
  let a = 0, b = 0
  for (const g of games) {
    if (g.score_a >= P && g.score_a - g.score_b >= 2) a++
    else if (g.score_b >= P && g.score_b - g.score_a >= 2) b++
  }
  return { a, b }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlayerAvatar({ info }: { info?: ParticipantInfo }) {
  if (info?.avatar_url) {
    return (
      <Image
        src={info.avatar_url}
        alt={info.full_name ?? ''}
        width={32}
        height={32}
        className="rounded-full object-cover shrink-0 ring-1 ring-white/10"
      />
    )
  }
  return (
    <div className="h-8 w-8 rounded-full bg-secondary/10 grid place-items-center shrink-0 ring-1 ring-white/8">
      <User className="h-3.5 w-3.5 text-secondary/40" />
    </div>
  )
}

function MatchCard({
  match,
  champId,
  stage,
  participantInfo,
}: {
  match: Match
  champId: string
  stage: Stage | null
  participantInfo: Record<string, ParticipantInfo>
}) {
  const pA = match.side_a_participant_id
    ? participantInfo[match.side_a_participant_id]
    : undefined
  const pB = match.side_b_participant_id
    ? participantInfo[match.side_b_participant_id]
    : undefined

  const score   = countSets(match.match_games, stage)
  const st      = MATCH_STATUS[match.status] ?? MATCH_STATUS.agendado
  const winnerA = match.result === 'lado_a'
  const winnerB = match.result === 'lado_b'

  return (
    <Link
      href={`/campeonatos/${champId}/jogos/${match.id}`}
      className="glass glass-card px-4 py-3.5 flex flex-col gap-2 active:scale-[0.985] transition-transform"
    >
      {/* Players */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <PlayerAvatar info={pA} />
          <span className={`text-[13px] leading-tight truncate font-medium ${winnerA ? 'text-secondary' : 'text-white/80'}`}>
            {pA?.full_name ?? '—'}
          </span>
        </div>
        <div className="flex flex-col items-center shrink-0 w-14 text-center">
          {score ? (
            <span className="text-base font-bold text-white tabular-nums tracking-tight">
              {score.a}–{score.b}
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-white/20 tracking-[0.15em] uppercase">vs</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className={`text-[13px] leading-tight truncate text-right font-medium ${winnerB ? 'text-secondary' : 'text-white/80'}`}>
            {pB?.full_name ?? '—'}
          </span>
          <PlayerAvatar info={pB} />
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-1.5">
          {st.dot && <span className="live-dot h-1.5 w-1.5 rounded-full bg-secondary inline-block" />}
          <span className={`text-[11px] font-medium ${st.cls}`}>{st.label}</span>
          {match.status === 'finalizado' && match.match_games.length > 0 && stage?.counting !== 'tempo' && (
            <span className="text-[11px] text-white/20 ml-1">
              ({match.match_games.length} set{match.match_games.length > 1 ? 's' : ''})
            </span>
          )}
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-white/20 shrink-0" />
      </div>
    </Link>
  )
}

function PlaceholderTab({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="glass glass-card px-4 py-12 text-center space-y-1.5">
      <p className="text-sm font-medium text-white/35">{title}</p>
      <p className="text-xs text-white/20">{desc}</p>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type TabId = 'jogos' | 'classificacao' | 'estatisticas'

const TABS: { id: TabId; label: string }[] = [
  { id: 'jogos',         label: 'Jogos' },
  { id: 'classificacao', label: 'Classificação' },
  { id: 'estatisticas',  label: 'Estatísticas' },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ChampionshipDetailClient({
  champ,
  stage,
  matches,
  participantInfo,
  canManage: _canManage,
  initialStandings,
  currentUserParticipantId,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('jogos')

  const champBadge = CHAMP_STATUS[champ.status] ?? CHAMP_STATUS.rascunho

  // Agrupa jogos por rodada
  const byRound = matches.reduce<Record<number, Match[]>>((acc, m) => {
    const r = m.round ?? 1
    ;(acc[r] ??= []).push(m)
    return acc
  }, {})
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b)
  const isMultiRound = stage ? stage.rounds > 1 : false

  // avatarUrl por participantId — derivado do participantInfo já disponível
  const participantAvatars: Record<string, string | null> = Object.fromEntries(
    Object.entries(participantInfo).map(([id, info]) => [id, info.avatar_url]),
  )

  return (
    <div className="px-5 py-4 space-y-4">
      {/* ← Voltar */}
      <Link
        href="/campeonatos"
        className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition"
      >
        <ChevronLeft className="h-4 w-4" />
        Campeonatos
      </Link>

      {/* Hero compacto */}
      <div className="glass glass-card px-4 py-3.5 flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-secondary/15 grid place-items-center shrink-0">
          <Trophy className="h-5 w-5 text-secondary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold text-white leading-snug truncate">{champ.name}</h1>
          <p className="text-xs text-white/40 mt-0.5">
            {FORMAT_LABEL[champ.format] ?? champ.format}
            {' · '}
            {UNIT_LABEL[champ.unit] ?? champ.unit}
            {stage && ` · ${stage.rounds}× round-robin`}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${champBadge.cls}`}>
          {champBadge.label}
        </span>
      </div>

      {/* TabBar */}
      <div className="glass glass-pill p-1 flex gap-0.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 rounded-full text-xs font-semibold transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-secondary text-primary'
                : 'text-white/40 hover:text-white/65 active:text-white/80'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Aba: Jogos ── */}
      {activeTab === 'jogos' && (
        <div className="space-y-4 reveal">
          {matches.length === 0 ? (
            <div className="glass glass-card px-4 py-12 text-center">
              <p className="text-sm text-white/30">Nenhum jogo gerado ainda.</p>
            </div>
          ) : (
            rounds.map((round) => (
              <section key={round} className="space-y-2">
                <div className="flex items-center gap-3 px-1">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 shrink-0">
                    {isMultiRound ? `Rodada ${round}` : 'Confrontos'}
                  </p>
                  <div className="flex-1 h-px bg-white/8" />
                  <span className="text-[11px] text-white/20 shrink-0">
                    {byRound[round].length}{' '}
                    {byRound[round].length === 1 ? 'jogo' : 'jogos'}
                  </span>
                </div>
                {byRound[round].map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    champId={champ.id}
                    stage={stage}
                    participantInfo={participantInfo}
                  />
                ))}
              </section>
            ))
          )}
        </div>
      )}

      {/* ── Aba: Classificação ── */}
      {activeTab === 'classificacao' && (
        <div className="reveal">
          <StandingsTable
            championshipId={champ.id}
            champStatus={champ.status}
            initialStandings={initialStandings}
            currentUserParticipantId={currentUserParticipantId}
            participantAvatars={participantAvatars}
          />
        </div>
      )}

      {/* ── Aba: Estatísticas ── */}
      {activeTab === 'estatisticas' && (
        <div className="reveal">
          <PlaceholderTab
            title="Estatísticas"
            desc="Cards de estatísticas individuais chegam na próxima fase."
          />
        </div>
      )}
    </div>
  )
}
