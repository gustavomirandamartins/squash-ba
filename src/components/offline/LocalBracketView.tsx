'use client'

// Visualização de bracket para campeonatos LOCAIS (provisórios/offline).
// Versão enxuta do BracketView: sem Supabase, sem realtime, sem router — recebe
// as partidas do snapshot e abre o placar via callback onOpenMatch.

import { User, Check, Clock } from 'lucide-react'
import type { LocalMatch } from '@/lib/offline/local-championship'
import type { StageCfg } from '@/lib/standings/compute'

type SideInfo = { name: string | null; avatarUrl: string | null }

// ── Layout (igual ao BracketView) ───────────────────────────────────────────
const CARD_W = 156
const CARD_H = 78
const CARD_GAP = 10
const CONN_W = 36
const SLOT_BASE = CARD_H + CARD_GAP

function countSets(games: { score_a: number; score_b: number }[], stage: StageCfg): { a: number; b: number } | null {
  if (!games.length) return null
  if (stage.counting === 'tempo') {
    return games[0] ? { a: games[0].score_a, b: games[0].score_b } : null
  }
  const P = stage.points_per_set
  let a = 0, b = 0
  for (const g of games) {
    if (stage.win_by_two) {
      if (g.score_a >= P && g.score_a - g.score_b >= 2) a++
      else if (g.score_b >= P && g.score_b - g.score_a >= 2) b++
    } else {
      if (g.score_a >= P && g.score_a > g.score_b) a++
      else if (g.score_b >= P && g.score_b > g.score_a) b++
    }
  }
  return { a, b }
}

function getRoundLabel(roundIdx: number, totalRounds: number): string {
  if (totalRounds === 1) return 'Final'
  const fromFinal = totalRounds - 1 - roundIdx
  if (fromFinal === 0) return 'Final'
  if (fromFinal === 1) return 'Semifinal'
  if (fromFinal === 2) return 'Quartas'
  if (fromFinal === 3) return 'Oitavas'
  return `R${roundIdx + 1}`
}

function Slot({
  side, info, isBye, isPlaceholder, isWinner, score,
}: {
  side: 'a' | 'b'
  info: SideInfo | null
  isBye: boolean
  isPlaceholder: boolean
  isWinner: boolean
  score: number | null
}) {
  void side
  if (isBye) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 min-w-0">
        <div className="h-6 w-6 rounded-full bg-white/5 grid place-items-center shrink-0">
          <span className="text-[8px] font-bold text-white/20">—</span>
        </div>
        <span className="text-xs text-white/20 italic">BYE</span>
      </div>
    )
  }
  if (isPlaceholder || !info) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 min-w-0">
        <div className="h-6 w-6 rounded-full bg-white/5 grid place-items-center shrink-0">
          <Clock className="h-3 w-3 text-white/15" />
        </div>
        <span className="text-xs text-white/20 italic">A definir</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 min-w-0">
      {info.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={info.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover shrink-0 ring-1 ring-white/10" />
      ) : (
        <div className={`h-6 w-6 rounded-full grid place-items-center shrink-0 ring-1 ${isWinner ? 'bg-secondary/20 ring-secondary/30' : 'bg-white/8 ring-white/10'}`}>
          <User className={`h-3 w-3 ${isWinner ? 'text-secondary/70' : 'text-white/30'}`} />
        </div>
      )}
      <span className={`text-xs leading-tight truncate font-medium flex-1 min-w-0 ${isWinner ? 'text-secondary' : 'text-white/80'}`}>
        {info.name ?? '—'}
      </span>
      {score !== null && (
        <span className={`ml-auto text-sm font-bold tabular-nums shrink-0 ${isWinner ? 'text-secondary' : 'text-white/35'}`}>
          {score}
        </span>
      )}
      {isWinner && <Check className="h-3 w-3 text-secondary shrink-0" strokeWidth={3} />}
    </div>
  )
}

function Card({
  match, nameById, stage, onOpen,
}: {
  match: LocalMatch
  nameById: Map<string, SideInfo>
  stage: StageCfg
  onOpen?: (id: string) => void
}) {
  const isByeA = match.sideA === null && match.status === 'finalizado'
  const isByeB = match.sideB === null && match.status === 'finalizado'
  const isBye = isByeA || isByeB
  const isPlaceholderA = !isByeA && match.sideA === null
  const isPlaceholderB = !isByeB && match.sideB === null
  const score = countSets(match.games, stage)
  const winnerA = match.result === 'lado_a'
  const winnerB = match.result === 'lado_b'
  const isLive = match.status === 'em_andamento'
  const canClick = onOpen && !isBye && match.sideA !== null && match.sideB !== null

  return (
    <div
      onClick={canClick ? () => onOpen!(match.id) : undefined}
      className={[
        'glass glass-card overflow-hidden select-none transition-all duration-200 flex flex-col',
        canClick ? 'cursor-pointer hover:border-white/20 active:scale-[0.97]' : '',
        isLive ? 'border-secondary/30' : '',
      ].filter(Boolean).join(' ')}
      style={{ width: CARD_W, height: CARD_H }}
    >
      <Slot side="a" info={match.sideA ? nameById.get(match.sideA) ?? null : null} isBye={isByeA} isPlaceholder={isPlaceholderA} isWinner={winnerA} score={score ? score.a : null} />
      <div className="mx-2.5 h-px bg-white/8 shrink-0 relative">
        <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 px-1.5 bg-primary">
          {isBye ? (
            <span className="text-[8px] font-semibold text-secondary/50 uppercase tracking-widest">auto</span>
          ) : isLive ? (
            <span className="flex items-center gap-0.5">
              <span className="live-dot h-1 w-1 rounded-full bg-secondary inline-block" />
              <span className="text-[8px] font-semibold text-secondary uppercase tracking-widest">ao vivo</span>
            </span>
          ) : score ? null : (
            <span className="text-[8px] font-semibold text-white/15 uppercase tracking-widest">vs</span>
          )}
        </div>
      </div>
      <Slot side="b" info={match.sideB ? nameById.get(match.sideB) ?? null : null} isBye={isByeB} isPlaceholder={isPlaceholderB} isWinner={winnerB} score={score ? score.b : null} />
    </div>
  )
}

function Connector({ matchCount, roundIndex, totalHeight, completed }: {
  matchCount: number; roundIndex: number; totalHeight: number; completed: boolean[]
}) {
  const slotH = SLOT_BASE * Math.pow(2, roundIndex)
  const pairs = Math.floor(matchCount / 2)
  return (
    <svg width={CONN_W} height={totalHeight} style={{ flexShrink: 0 }} aria-hidden="true">
      {Array.from({ length: pairs }, (_, i) => {
        const topCY = (i * 2 + 0.5) * slotH
        const botCY = (i * 2 + 1.5) * slotH
        const midY = (topCY + botCY) / 2
        const color = completed[i] ? 'rgba(205,253,81,0.35)' : 'rgba(255,255,255,0.12)'
        return (
          <g key={i} stroke={color} strokeWidth="1" fill="none">
            <line x1={0} y1={topCY} x2={CONN_W / 2} y2={topCY} />
            <line x1={0} y1={botCY} x2={CONN_W / 2} y2={botCY} />
            <line x1={CONN_W / 2} y1={topCY} x2={CONN_W / 2} y2={botCY} />
            <line x1={CONN_W / 2} y1={midY} x2={CONN_W} y2={midY} />
          </g>
        )
      })}
    </svg>
  )
}

export function LocalBracketView({
  matches, nameById, stage, onOpenMatch,
}: {
  matches: LocalMatch[]
  nameById: Map<string, SideInfo>
  stage: StageCfg
  onOpenMatch: (id: string) => void
}) {
  const bracketMatches = matches.filter((m) => (m.bracketSlot ?? 0) > 0)
  if (bracketMatches.length === 0) {
    return (
      <div className="glass glass-card px-5 py-10 text-center space-y-2">
        <Clock className="h-7 w-7 text-white/15 mx-auto" />
        <p className="text-sm font-medium text-white/35">Chave ainda não gerada</p>
        <p className="text-xs text-white/20 max-w-xs mx-auto leading-relaxed">
          O chaveamento aparece quando todos os jogos da fase de grupos terminarem.
        </p>
      </div>
    )
  }

  // Agrupa por rodada
  const roundMap = new Map<number, LocalMatch[]>()
  for (const m of bracketMatches) {
    const r = m.round ?? 1
    if (!roundMap.has(r)) roundMap.set(r, [])
    roundMap.get(r)!.push(m)
  }
  const roundNums = [...roundMap.keys()].sort((a, b) => a - b)
  const rounds = roundNums.map((r) => roundMap.get(r)!.sort((a, b) => (a.bracketSlot ?? 0) - (b.bracketSlot ?? 0)))

  const firstRoundCount = rounds[0].length
  const totalHeight = firstRoundCount * SLOT_BASE

  const isCompletedPair = (ri: number, pi: number) =>
    rounds[ri][pi * 2]?.status === 'finalizado' && rounds[ri][pi * 2 + 1]?.status === 'finalizado'

  return (
    <div className="overflow-x-auto pb-4">
      <div style={{ minWidth: rounds.length * (CARD_W + CONN_W) + CARD_W }}>
        {/* Labels */}
        <div className="flex items-center mb-3">
          {rounds.map((_, ri) => (
            <div key={ri} className="flex items-center shrink-0">
              <div style={{ width: CARD_W }} className="text-center">
                <span className="text-[9px] font-semibold uppercase tracking-widest text-white/30">
                  {getRoundLabel(ri, rounds.length)}
                </span>
              </div>
              {ri < rounds.length - 1 && <div style={{ width: CONN_W }} />}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex items-start" style={{ height: totalHeight }}>
          {rounds.map((roundMatches, ri) => {
            const slotH = SLOT_BASE * Math.pow(2, ri)
            const pairsCount = Math.floor(roundMatches.length / 2)
            return (
              <div key={ri} className="flex items-start shrink-0" style={{ height: totalHeight }}>
                <div style={{ width: CARD_W }}>
                  {roundMatches.map((m) => (
                    <div key={m.id} style={{ height: slotH, paddingTop: slotH / 2 - CARD_H / 2 }}>
                      <Card match={m} nameById={nameById} stage={stage} onOpen={onOpenMatch} />
                    </div>
                  ))}
                </div>
                {ri < rounds.length - 1 && (
                  <div style={{ height: totalHeight }}>
                    <Connector
                      matchCount={roundMatches.length}
                      roundIndex={ri}
                      totalHeight={totalHeight}
                      completed={Array.from({ length: pairsCount }, (_, i) => isCompletedPair(ri, i))}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
