'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { User, Check, Medal, Clock, Zap } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { StandingsTable, type Standing } from './StandingsTable'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type BracketMatch = {
  id: string
  round: number
  bracket_slot: number | null
  status: string
  result: string | null
  side_a_participant_id: string | null
  side_b_participant_id: string | null
  match_games: { game_number: number; score_a: number; score_b: number }[]
}

export type BracketStage = {
  counting: string
  sets_to_play: number
  points_per_set: number
  win_by_two: boolean
}

export type BracketParticipantInfo = {
  full_name: string | null
  avatar_url: string | null
}

type Props = {
  championshipId: string
  champStatus: string
  initialMatches: BracketMatch[]
  participantInfo: Record<string, BracketParticipantInfo>
  participantAvatars: Record<string, string | null>
  stage: BracketStage | null
  hasThirdPlace: boolean
  canManage: boolean
  currentUserParticipantId: string | null
  initialStandings: Standing[]
  /** sub-label por participante: "1º Grupo A", "2º Grupo B" etc. (grupos_elim) */
  participantGroupLabels?: Record<string, string>
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const CARD_W   = 156   // px — match card width
const CARD_H   = 78    // px — match card height
const CARD_GAP = 10    // px — gap between cards in same column
const CONN_W   = 36    // px — connector SVG width
const SLOT_BASE = CARD_H + CARD_GAP  // = 88px per slot in R1

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nextPow2(n: number): number {
  let s = 1
  while (s < n) s *= 2
  return s
}

function countSets(
  games: { score_a: number; score_b: number }[],
  stage: BracketStage | null,
): { a: number; b: number } | null {
  if (!games.length || !stage) return null
  if (stage.counting === 'tempo') {
    return games[0] ? { a: games[0].score_a, b: games[0].score_b } : null
  }
  const P = stage.points_per_set
  let a = 0, b = 0
  for (const g of games) {
    if (g.score_a >= P && g.score_a - g.score_b >= 2) a++
    else if (g.score_b >= P && g.score_b - g.score_a >= 2) b++
  }
  return { a, b }
}

function getRoundLabel(roundIdx: number, totalRounds: number): string {
  if (totalRounds === 1) return 'Final'
  const roundsFromFinal = totalRounds - 1 - roundIdx
  if (roundsFromFinal === 0) return 'Final'
  if (roundsFromFinal === 1) return 'Semifinal'
  if (roundsFromFinal === 2) return 'Quartas'
  if (roundsFromFinal === 3) return 'Oitavas'
  return `R${roundIdx + 1}`
}

// ─── PlayerSlot ───────────────────────────────────────────────────────────────

function PlayerSlot({
  participantId,
  participantInfo,
  isBye,
  isPlaceholder,
  isWinner,
  score,
  groupLabel,
}: {
  participantId: string | null
  participantInfo: Record<string, BracketParticipantInfo>
  isBye: boolean
  isPlaceholder: boolean
  isWinner: boolean
  score: number | null
  groupLabel?: string
}) {
  if (isBye) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 min-w-0">
        <div className="h-6 w-6 rounded-full bg-white/5 grid place-items-center shrink-0">
          <span className="text-[8px] font-bold text-white/20">—</span>
        </div>
        <span className="text-xs text-white/20 italic">BYE</span>
        {score !== null && (
          <span className="ml-auto text-xs font-bold tabular-nums text-white/20 shrink-0">
            {score}
          </span>
        )}
      </div>
    )
  }

  if (isPlaceholder || !participantId) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 min-w-0">
        <div className="h-6 w-6 rounded-full bg-white/5 grid place-items-center shrink-0">
          <Clock className="h-3 w-3 text-white/15" />
        </div>
        <span className="text-xs text-white/20 italic">A definir</span>
      </div>
    )
  }

  const info = participantInfo[participantId]
  const name = info?.full_name ?? '—'

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 min-w-0">
      {info?.avatar_url ? (
        <Image
          src={info.avatar_url}
          alt={name}
          width={24}
          height={24}
          className="rounded-full object-cover shrink-0 ring-1 ring-white/10"
        />
      ) : (
        <div
          className={`h-6 w-6 rounded-full grid place-items-center shrink-0 ring-1 ${
            isWinner
              ? 'bg-secondary/20 ring-secondary/30'
              : 'bg-white/8 ring-white/10'
          }`}
        >
          <User className={`h-3 w-3 ${isWinner ? 'text-secondary/70' : 'text-white/30'}`} />
        </div>
      )}
      <span
        className={`text-xs leading-tight truncate font-medium flex-1 min-w-0 ${
          isWinner ? 'text-secondary' : 'text-white/80'
        }`}
      >
        {name}
        {groupLabel && (
          <span className="ml-1 text-[8px] font-normal text-white/25">
            {groupLabel}
          </span>
        )}
      </span>
      {score !== null && (
        <span
          className={`ml-auto text-sm font-bold tabular-nums shrink-0 ${
            isWinner ? 'text-secondary' : 'text-white/35'
          }`}
        >
          {score}
        </span>
      )}
      {isWinner && (
        <Check className="h-3 w-3 text-secondary shrink-0" strokeWidth={3} />
      )}
    </div>
  )
}

// ─── MatchCard ────────────────────────────────────────────────────────────────

function MatchCard({
  match,
  participantInfo,
  stage,
  champId,
  onClick,
  participantGroupLabels,
}: {
  match: BracketMatch
  participantInfo: Record<string, BracketParticipantInfo>
  stage: BracketStage | null
  champId: string
  onClick?: () => void
  participantGroupLabels?: Record<string, string>
}) {
  const isByeA = match.side_a_participant_id === null
  const isByeB = match.side_b_participant_id === null
  const isBye = match.status === 'finalizado' && (isByeA || isByeB)
  const isAutoAdvance = isBye
  const isPlaceholderA = !isByeA && match.side_a_participant_id === null
  const isPlaceholderB = !isByeB && match.side_b_participant_id === null

  const score = countSets(match.match_games, stage)
  const winnerA = match.result === 'lado_a'
  const winnerB = match.result === 'lado_b'
  const isDone = match.status === 'finalizado'
  const isLive = match.status === 'em_andamento'
  const isSets = stage?.counting === 'set' || stage?.counting === 'sets'
  const sortedGames = [...match.match_games].sort((a, b) => a.game_number - b.game_number)
  const showGameDetail = isDone && isSets && sortedGames.length >= 2

  const canClick =
    onClick &&
    !isBye &&
    match.side_a_participant_id !== null &&
    match.side_b_participant_id !== null

  const card = (
    <div
      onClick={canClick ? onClick : undefined}
      className={[
        'glass glass-card overflow-hidden select-none transition-all duration-200',
        'flex flex-col',
        canClick ? 'cursor-pointer hover:border-white/20 active:scale-[0.97]' : '',
        isDone && !isBye ? 'opacity-90' : '',
        isLive ? 'border-secondary/30' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ width: CARD_W, height: CARD_H }}
    >
      {/* Side A */}
      <PlayerSlot
        participantId={match.side_a_participant_id}
        participantInfo={participantInfo}
        isBye={isByeA && isAutoAdvance}
        isPlaceholder={isPlaceholderA}
        isWinner={winnerA}
        score={score ? score.a : null}
        groupLabel={
          match.side_a_participant_id
            ? participantGroupLabels?.[match.side_a_participant_id]
            : undefined
        }
      />

      {/* Separator */}
      <div className="mx-2.5 h-px bg-white/8 shrink-0 relative">
        <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 px-1.5 bg-primary">
          {isAutoAdvance ? (
            <span className="text-[8px] font-semibold text-secondary/50 uppercase tracking-widest">
              auto
            </span>
          ) : isLive ? (
            <span className="flex items-center gap-0.5">
              <span className="live-dot h-1 w-1 rounded-full bg-secondary inline-block" />
              <span className="text-[8px] font-semibold text-secondary uppercase tracking-widest">
                ao vivo
              </span>
            </span>
          ) : showGameDetail ? (
            <span className="text-[8px] text-white/25 tabular-nums font-mono tracking-tight max-w-[130px] truncate">
              {sortedGames.map((g) => `${g.score_a}·${g.score_b}`).join('  ')}
            </span>
          ) : score ? null : (
            <span className="text-[8px] font-semibold text-white/15 uppercase tracking-widest">
              vs
            </span>
          )}
        </div>
      </div>

      {/* Side B */}
      <PlayerSlot
        participantId={match.side_b_participant_id}
        participantInfo={participantInfo}
        isBye={isByeB && isAutoAdvance}
        isPlaceholder={isPlaceholderB}
        isWinner={winnerB}
        score={score ? score.b : null}
        groupLabel={
          match.side_b_participant_id
            ? participantGroupLabels?.[match.side_b_participant_id]
            : undefined
        }
      />
    </div>
  )

  return card
}

// ─── BracketConnector (SVG) ───────────────────────────────────────────────────

function BracketConnector({
  matchCount,
  roundIndex,
  totalHeight,
  completedPairs,
}: {
  matchCount: number
  roundIndex: number
  totalHeight: number
  completedPairs: boolean[]
}) {
  const slotH = SLOT_BASE * Math.pow(2, roundIndex)
  const pairs = Math.floor(matchCount / 2)

  return (
    <svg
      width={CONN_W}
      height={totalHeight}
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      {Array.from({ length: pairs }, (_, i) => {
        const topCY = (i * 2 + 0.5) * slotH
        const botCY = (i * 2 + 1.5) * slotH
        const midY = (topCY + botCY) / 2
        const done = completedPairs[i] ?? false
        const color = done ? 'rgba(205,253,81,0.35)' : 'rgba(255,255,255,0.12)'

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

// ─── BracketView ──────────────────────────────────────────────────────────────

export function BracketView({
  championshipId,
  champStatus,
  initialMatches,
  participantInfo,
  participantAvatars,
  stage,
  hasThirdPlace,
  canManage: _canManage,
  currentUserParticipantId,
  initialStandings,
  participantGroupLabels,
}: Props) {
  const router = useRouter()
  const [matches, setMatches] = useState<BracketMatch[]>(initialMatches)
  const [supabase] = useState(() => createClient())
  const refetchRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // ── Realtime refetch ───────────────────────────────────────────────────────
  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select(
        `id, round, bracket_slot, result, status,
         side_a_participant_id, side_b_participant_id,
         match_games(game_number, score_a, score_b)`,
      )
      .eq('championship_id', championshipId)
      .order('round', { ascending: true })
      .order('created_at', { ascending: true })

    if (data) {
      setMatches(
        data.map((m) => ({
          id: m.id,
          round: m.round ?? 1,
          bracket_slot: m.bracket_slot ?? null,
          status: m.status,
          result: m.result ?? null,
          side_a_participant_id: m.side_a_participant_id ?? null,
          side_b_participant_id: m.side_b_participant_id ?? null,
          match_games: (
            (m.match_games as { game_number: number; score_a: number; score_b: number }[]) ?? []
          ),
        })),
      )
    }
  }, [supabase, championshipId])

  useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])

  useEffect(() => {
    const channel = supabase
      .channel(`bracket-${championshipId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `championship_id=eq.${championshipId}`,
        },
        () => { void refetchRef.current() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_games' },
        () => { void refetchRef.current() },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [supabase, championshipId])

  // ── Detecta triangular (N=3) ───────────────────────────────────────────────
  const isBracketMatch = matches.some((m) => (m.bracket_slot ?? 0) > 0)
  // Só é triangular quando HÁ jogos gerados (round-robin) sem bracket_slot.
  // Sem nenhum jogo = bracket ainda não gerado (rascunho) → não mostrar classificação.
  const isTriangular = !isBracketMatch && matches.length > 0

  if (isTriangular) {
    // N=3: round-robin triangular → mostra tabela de classificação
    return (
      <div className="space-y-4">
        <div className="glass glass-card px-4 py-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-secondary/70 shrink-0" />
          <p className="text-xs text-white/55">
            3 jogadores — formato triangular: todos jogam entre si.
          </p>
        </div>
        <StandingsTable
          championshipId={championshipId}
          champStatus={champStatus}
          initialStandings={initialStandings}
          currentUserParticipantId={currentUserParticipantId}
          participantAvatars={participantAvatars}
        />
      </div>
    )
  }

  if (!isBracketMatch) {
    // Eliminatória sem jogos gerados ainda (rascunho)
    return (
      <div className="glass glass-card px-5 py-10 text-center space-y-2">
        <Zap className="h-8 w-8 text-white/15 mx-auto" />
        <p className="text-sm font-medium text-white/35 mt-2">Bracket ainda não gerado</p>
        <p className="text-xs text-white/20 max-w-xs mx-auto leading-relaxed">
          {champStatus === 'rascunho'
            ? 'Ative o campeonato para gerar o chaveamento eliminatório.'
            : 'O chaveamento aparecerá aqui assim que for gerado.'}
        </p>
      </div>
    )
  }

  // ── Separa bronze e bracket ────────────────────────────────────────────────
  const bronzeMatch = matches.find((m) => m.bracket_slot === -2) ?? null
  const bracketMatches = matches.filter((m) => (m.bracket_slot ?? 0) > 0)

  // Agrupa por round, ordena por bracket_slot
  const roundMap = new Map<number, BracketMatch[]>()
  for (const m of bracketMatches) {
    const r = m.round ?? 1
    if (!roundMap.has(r)) roundMap.set(r, [])
    roundMap.get(r)!.push(m)
  }
  const roundNums = Array.from(roundMap.keys()).sort((a, b) => a - b)
  const rounds = roundNums.map((r) =>
    roundMap.get(r)!.sort((a, b) => (a.bracket_slot ?? 0) - (b.bracket_slot ?? 0)),
  )

  if (rounds.length === 0) {
    return (
      <div className="glass glass-card px-4 py-10 text-center">
        <p className="text-sm text-white/30">Bracket ainda não gerado.</p>
      </div>
    )
  }

  // ── Layout math ────────────────────────────────────────────────────────────
  // O total de slots é determinado pela primeira rodada (mais matches)
  const firstRoundCount = rounds[0].length
  const totalHeight = firstRoundCount * SLOT_BASE

  // Para calcular completedPairs (connector colorido quando ambos avançaram)
  function isCompletedPair(roundIdx: number, pairIdx: number): boolean {
    const roundMatches = rounds[roundIdx]
    const matchA = roundMatches[pairIdx * 2]
    const matchB = roundMatches[pairIdx * 2 + 1]
    return (matchA?.status === 'finalizado') && (matchB?.status === 'finalizado')
  }

  return (
    <div className="space-y-4">
      {/* Status indicator */}
      {champStatus === 'ativo' && (
        <div className="flex items-center gap-2 px-1">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-secondary inline-block" />
          <span className="text-[11px] font-semibold text-secondary">Ao vivo</span>
          <span className="text-[11px] text-white/30">— bracket atualiza automaticamente</span>
        </div>
      )}

      {/* Bracket horizontal scroll
          Os labels de round ficam numa faixa separada ACIMA do grid de partidas,
          para que o cálculo de altura (totalHeight) seja exato e o overflow-x-auto
          não corte os cards verticalmente. */}
      <div className="overflow-x-auto pb-4">
        <div style={{ minWidth: rounds.length * (CARD_W + CONN_W) + CARD_W }}>

          {/* ── Faixa de labels ── */}
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

          {/* ── Grid de partidas ── */}
          <div className="flex items-start" style={{ height: totalHeight }}>
            {rounds.map((roundMatches, ri) => {
              const slotH = SLOT_BASE * Math.pow(2, ri)
              const pairsCount = Math.floor(roundMatches.length / 2)

              return (
                <div key={ri} className="flex items-start shrink-0" style={{ height: totalHeight }}>
                  {/* Coluna de cards */}
                  <div style={{ width: CARD_W }}>
                    {roundMatches.map((match) => (
                      <div
                        key={match.id}
                        style={{ height: slotH, paddingTop: slotH / 2 - CARD_H / 2 }}
                      >
                        <MatchCard
                          match={match}
                          participantInfo={participantInfo}
                          stage={stage}
                          champId={championshipId}
                          participantGroupLabels={participantGroupLabels}
                          onClick={
                            match.side_a_participant_id !== null &&
                            match.side_b_participant_id !== null
                              ? () => router.push(`/campeonatos/${championshipId}/jogos/${match.id}`)
                              : undefined
                          }
                        />
                      </div>
                    ))}
                  </div>

                  {/* Conector SVG (apenas entre rodadas) */}
                  {ri < rounds.length - 1 && (
                    <div style={{ height: totalHeight }}>
                      <BracketConnector
                        matchCount={roundMatches.length}
                        roundIndex={ri}
                        totalHeight={totalHeight}
                        completedPairs={Array.from({ length: pairsCount }, (_, i) =>
                          isCompletedPair(ri, i),
                        )}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

        </div>
      </div>

      {/* Bronze match */}
      {hasThirdPlace && bronzeMatch && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-3 px-1">
            <div className="flex items-center gap-1.5">
              <Medal className="h-3.5 w-3.5 text-orange-400/70" />
              <p className="text-[11px] font-semibold uppercase tracking-widest text-orange-400/70">
                Disputa de 3º lugar
              </p>
            </div>
            <div className="flex-1 h-px bg-white/8" />
          </div>
          <div className="flex justify-center">
            <MatchCard
              match={bronzeMatch}
              participantInfo={participantInfo}
              stage={stage}
              champId={championshipId}
              participantGroupLabels={participantGroupLabels}
              onClick={
                bronzeMatch.side_a_participant_id !== null &&
                bronzeMatch.side_b_participant_id !== null
                  ? () => router.push(`/campeonatos/${championshipId}/jogos/${bronzeMatch.id}`)
                  : undefined
              }
            />
          </div>
        </div>
      )}

      {/* Dica de interação */}
      {matches.some((m) => m.status === 'agendado' && m.side_a_participant_id && m.side_b_participant_id) && (
        <p className="text-[10px] text-white/18 text-center px-4">
          Toque em um jogo para registrar o placar
        </p>
      )}
    </div>
  )
}
