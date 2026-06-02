'use client'

import { useState, useMemo, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { saveCachedChamp } from '@/lib/offline/champ-cache'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Trophy, User, Medal, GitMerge, Layers, MessageSquare, CalendarDays, Rocket } from 'lucide-react'
import { StandingsTable, type Standing } from './StandingsTable'
import { BracketView } from './BracketView'
import { GroupsView, type Group } from './GroupsView'
import { StatsTab } from './StatsTab'
import { ManageBar } from '@/components/ManageBar'
import { activateChampionship } from '@/app/(app)/campeonatos/manage-actions'

// ─── Tipos exportados (reutilizados em page.tsx) ──────────────────────────────

export type { Standing }

export type GameScore = {
  game_number: number
  score_a: number
  score_b: number
}

export type Match = {
  id: string
  stage_id: string
  round: number
  bracket_slot: number | null
  result: string | null
  status: string
  is_wo?: boolean
  side_a_participant_id: string | null
  side_b_participant_id: string | null
  match_games: GameScore[]
}

export type Stage = {
  id: string
  kind?: string
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
  start_date: string | null
  allow_draw: boolean
  points_win: number
  points_draw: number
  points_loss: number
  tiebreakers: string[]
  created_by: string
  has_third_place: boolean
}

export type ParticipantInfo = {
  full_name: string | null
  avatar_url: string | null
}

type Props = {
  champ: ChampData
  /** Fase principal: liga stage para liga, grupos stage para grupos_elim, elim stage para elim */
  stage: Stage | null
  /** Fase eliminatória (apenas grupos_elim) */
  elimStage?: Stage | null
  matches: Match[]
  participantInfo: Record<string, ParticipantInfo>
  canManage: boolean
  initialStandings: Standing[]
  currentUserParticipantId: string | null
  // grupos_elim specific
  groups?: Group[]
  /** participantId → groupId */
  participantGroups?: Record<string, string>
  /** ID da conversa de grupo do campeonato (se existir) */
  groupConversationId?: string | null
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
  rascunho:  { label: 'Rascunho',  cls: 'bg-white/8 text-white/45' },
  ativo:     { label: 'Ativo',     cls: 'bg-secondary/20 text-secondary' },
  encerrado: { label: 'Encerrado', cls: 'bg-white/5 text-white/30' },
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
  const w2 = stage.win_by_two
  let a = 0, b = 0
  for (const g of games) {
    if (w2) {
      if (g.score_a >= P && g.score_a - g.score_b >= 2) a++
      else if (g.score_b >= P && g.score_b - g.score_a >= 2) b++
    } else {
      // sem vantagem de 2: vence o set quem chega a P com mais pontos
      if (g.score_a >= P && g.score_a > g.score_b) a++
      else if (g.score_b >= P && g.score_b > g.score_a) b++
    }
  }
  return { a, b }
}

function getEliminatoriaRoundLabel(round: number, maxRound: number): string {
  const fromFinal = maxRound - round
  if (fromFinal === 0) return 'Final'
  if (fromFinal === 1) return 'Semifinais'
  if (fromFinal === 2) return 'Quartas de Final'
  if (fromFinal === 3) return 'Oitavas de Final'
  return `${round}ª Rodada`
}

/** Jogo de walkover: um dos lados é null e já está finalizado (BYE automático). */
function isElimBye(m: Match): boolean {
  return (
    m.status === 'finalizado' &&
    (m.side_a_participant_id === null || m.side_b_participant_id === null)
  )
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
  const isSets  = stage?.counting === 'set' || stage?.counting === 'sets'
  const isTempo = stage?.counting === 'tempo'
  const sortedGames = [...match.match_games].sort((a, b) => a.game_number - b.game_number)
  // 1 set: placar em destaque é o de PONTOS (não "1×0"). MD3/MD5: destaque = sets,
  // e o placar de cada set vai logo abaixo.
  const isSingleGame  = match.status === 'finalizado' && sortedGames.length === 1
  const showSetDetail = match.status === 'finalizado' && isSets && sortedGames.length >= 2
  const headA = isSingleGame ? sortedGames[0].score_a : score?.a
  const headB = isSingleGame ? sortedGames[0].score_b : score?.b

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
          {match.status === 'finalizado' && match.is_wo ? (
            <span className="text-[11px] font-bold text-amber-400/80 uppercase tracking-wider">W.O.</span>
          ) : headA != null ? (
            <span className={`text-base font-bold tabular-nums tracking-tight ${match.status === 'finalizado' ? 'text-white' : 'text-white/70'}`}>
              {headA}–{headB}
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-white/20 tracking-[0.15em] uppercase">vs</span>
          )}
          {/* Placar de pontos de cada set (MD3/MD5) */}
          {showSetDetail && (
            <span className="text-[10px] text-white/30 tabular-nums mt-0.5 leading-tight">
              {sortedGames.map((g) => `${g.score_a}·${g.score_b}`).join('  ')}
            </span>
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
          {match.status === 'finalizado' && sortedGames.length > 0 && !isTempo && (
            <span className="text-[11px] text-white/20 ml-1">
              {isSets
                ? `${sortedGames.length} set${sortedGames.length > 1 ? 's' : ''}`
                : null}
            </span>
          )}
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-white/20 shrink-0" />
      </div>
    </Link>
  )
}

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 shrink-0">
        {label}
      </p>
      <div className="flex-1 h-px bg-white/8" />
      {count !== undefined && (
        <span className="text-[11px] text-white/20 shrink-0">
          {count} {count === 1 ? 'jogo' : 'jogos'}
        </span>
      )}
    </div>
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

type TabId = 'jogos' | 'classificacao' | 'bracket' | 'estatisticas' | 'grupos'

const TABS_DEFAULT: { id: TabId; label: string }[] = [
  { id: 'jogos',         label: 'Jogos' },
  { id: 'classificacao', label: 'Classificação' },
  { id: 'estatisticas',  label: 'Estatísticas' },
]

const TABS_ELIM: { id: TabId; label: string }[] = [
  { id: 'bracket',      label: 'Bracket' },
  { id: 'jogos',        label: 'Jogos' },
  { id: 'estatisticas', label: 'Estatísticas' },
]

const TABS_GRUPOS_ELIM: { id: TabId; label: string }[] = [
  { id: 'grupos',       label: 'Grupos' },
  { id: 'bracket',      label: 'Bracket' },
  { id: 'jogos',        label: 'Jogos' },
  { id: 'estatisticas', label: 'Estatísticas' },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ChampionshipDetailClient({
  champ,
  stage,
  elimStage,
  matches,
  participantInfo,
  canManage,
  initialStandings,
  currentUserParticipantId,
  groups = [],
  participantGroups = {},
  groupConversationId = null,
}: Props) {
  const isElim       = champ.format === 'eliminatoria'
  const isGruposElim = champ.format === 'grupos_elim'

  const TABS = isGruposElim ? TABS_GRUPOS_ELIM : isElim ? TABS_ELIM : TABS_DEFAULT
  const defaultTab: TabId = isGruposElim ? 'grupos' : isElim ? 'bracket' : 'jogos'
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab)

  const champBadge = CHAMP_STATUS[champ.status] ?? CHAMP_STATUS.rascunho

  // ── Ativação (#3) ──────────────────────────────────────────────────────────
  const router = useRouter()
  const [activating, startActivate] = useTransition()
  const [activateError, setActivateError] = useState<string | null>(null)

  function handleActivate() {
    setActivateError(null)
    startActivate(async () => {
      const res = await activateChampionship(champ.id)
      if (res.error) { setActivateError(res.error); return }
      router.refresh()
    })
  }

  const startDateLabel = champ.start_date
    ? new Date(champ.start_date + 'T00:00:00').toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null

  // ── participantGroupLabels for BracketView ─────────────────────────────────
  const participantGroupLabels = useMemo<Record<string, string>>(() => {
    if (!isGruposElim || !groups.length || !initialStandings.length) return {}
    const result: Record<string, string> = {}
    for (const group of groups) {
      const groupStandings = initialStandings
        .filter((s) => participantGroups[s.participant_id] === group.id)
        .sort((a, b) => a.position - b.position)
      groupStandings.forEach((s, idx) => {
        result[s.participant_id] = `${idx + 1}º Gr. ${group.name}`
      })
    }
    return result
  }, [isGruposElim, groups, initialStandings, participantGroups])

  // ── avatarUrl por participantId ────────────────────────────────────────────
  const participantAvatars: Record<string, string | null> = Object.fromEntries(
    Object.entries(participantInfo).map(([id, info]) => [id, info.avatar_url]),
  )

  // ── Campeão (só quando campeonato encerrado) ───────────────────────────────
  const champion = useMemo<{ name: string | null; avatarUrl: string | null } | null>(() => {
    if (champ.status !== 'encerrado') return null
    if (!isElim && !isGruposElim) {
      // Liga: 1º lugar nas classificações
      const top = initialStandings[0]
      if (!top) return null
      const info = participantInfo[top.participant_id]
      return { name: top.display_name ?? info?.full_name ?? null, avatarUrl: info?.avatar_url ?? null }
    }
    // Eliminatória / Grupos+Elim: vencedor da final (maior rodada, bracket_slot>0, não é bronze)
    const stId = isGruposElim ? (elimStage?.id ?? null) : stage?.id
    const finalMatches = matches
      .filter((m) => m.status === 'finalizado' && m.bracket_slot !== -2 && (stId ? m.stage_id === stId : true))
    if (!finalMatches.length) return null
    const maxRound = Math.max(...finalMatches.map((m) => m.round))
    const finalMatch = finalMatches.find((m) => m.round === maxRound)
    if (!finalMatch || !finalMatch.result) return null
    const winnerId = finalMatch.result === 'lado_a'
      ? finalMatch.side_a_participant_id
      : finalMatch.side_b_participant_id
    if (!winnerId) return null
    const info = participantInfo[winnerId]
    return { name: info?.full_name ?? null, avatarUrl: info?.avatar_url ?? null }
  }, [champ.status, isElim, isGruposElim, initialStandings, matches, participantInfo, stage, elimStage])

  // ── Cache da estrutura p/ uso OFFLINE (abrir jogos + lançar placar) ─────────
  // Gravado ao abrir o detalhe online. O shell offline (/~offline) lê este cache
  // para renderizar a lista de jogos e a tela de placar real sem rede.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const side = (pid: string | null) => ({
      name: pid ? (participantInfo[pid]?.full_name ?? null) : null,
      avatarUrl: pid ? (participantInfo[pid]?.avatar_url ?? null) : null,
    })
    const cachedMatches = matches.map((m) => {
      const st = elimStage && m.stage_id === elimStage.id ? elimStage : stage
      return {
        id: m.id,
        round: m.round,
        bracketSlot: m.bracket_slot,
        groupId: null,
        status: m.status,
        result: m.result,
        sideA: side(m.side_a_participant_id),
        sideB: side(m.side_b_participant_id),
        games: m.match_games,
        counting: st?.counting ?? 'set',
        setsToPlay: st?.sets_to_play ?? 3,
        pointsPerSet: st?.points_per_set ?? 11,
        winByTwo: st?.win_by_two ?? true,
        setDrawEnabled: st?.set_draw_enabled ?? false,
        timeMinutes: st?.time_minutes ?? null,
      }
    })
    void saveCachedChamp({
      id: champ.id,
      name: champ.name,
      format: champ.format,
      canManage,
      matches: cachedMatches,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champ.id, champ.status, matches])

  // ── Dados p/ classificação offline ao vivo (liga) ──────────────────────────
  const offlineStandingsData = useMemo(() => {
    if (!stage) return undefined
    return {
      matches: matches.map((m) => ({
        id: m.id,
        side_a_participant_id: m.side_a_participant_id,
        side_b_participant_id: m.side_b_participant_id,
        match_games: m.match_games,
      })),
      participants: Object.entries(participantInfo).map(([id, info]) => ({
        id,
        name: info.full_name,
      })),
      stage: {
        counting: stage.counting,
        points_per_set: stage.points_per_set,
        win_by_two: stage.win_by_two,
        set_draw_enabled: stage.set_draw_enabled,
        sets_to_play: stage.sets_to_play,
      },
      champ: {
        pointsWin: champ.points_win,
        pointsDraw: champ.points_draw,
        pointsLoss: champ.points_loss,
        tiebreakers: champ.tiebreakers,
      },
    }
  }, [stage, matches, participantInfo, champ])

  // Idem, mas só com os jogos da fase de grupos (para o GroupsView offline).
  const gruposOfflineData = useMemo(() => {
    if (!stage || !isGruposElim) return undefined
    return {
      ...offlineStandingsData!,
      matches: matches
        .filter((m) => m.stage_id === stage.id)
        .map((m) => ({
          id: m.id,
          side_a_participant_id: m.side_a_participant_id,
          side_b_participant_id: m.side_b_participant_id,
          match_games: m.match_games,
        })),
    }
  }, [stage, isGruposElim, matches, offlineStandingsData])

  // ── Matches para aba Jogos ─────────────────────────────────────────────────

  // === Liga / outros ===
  const bronzeMatch      = isElim ? (matches.find((m) => m.bracket_slot === -2) ?? null) : null
  const elimMainMatches  = isElim ? matches.filter((m) => m.bracket_slot !== -2 && !isElimBye(m)) : []
  const byRound          = (isElim ? elimMainMatches : matches).reduce<Record<number, Match[]>>(
    (acc, m) => { const r = m.round ?? 1; (acc[r] ??= []).push(m); return acc },
    {},
  )
  const rounds           = Object.keys(byRound).map(Number).sort((a, b) => a - b)
  // Várias rodadas (matchdays) → rotular "Rodada N", mesmo em turno único.
  const isMultiRound     = rounds.length > 1
  const elimMaxRound     = rounds.length > 0 ? Math.max(...rounds) : 0

  // === grupos_elim: split by stage ===
  const gruposStageId = stage?.id ?? null        // stage = grupos stage para grupos_elim
  const elimStageId   = elimStage?.id ?? null

  // Jogos de grupos, agrupados por groupId (inferido via participantGroups)
  const grupoMatchesByGroupId = useMemo<Record<string, Match[]>>(() => {
    if (!isGruposElim || !gruposStageId) return {}
    const acc: Record<string, Match[]> = {}
    for (const m of matches) {
      if (m.stage_id !== gruposStageId) continue
      const pId = m.side_a_participant_id ?? m.side_b_participant_id
      const gId = pId ? (participantGroups[pId] ?? '__unknown') : '__unknown'
      ;(acc[gId] ??= []).push(m)
    }
    return acc
  }, [isGruposElim, gruposStageId, matches, participantGroups])

  // Jogos eliminatórios, agrupados por rodada
  const elimMatchesByRound = useMemo<Record<number, Match[]>>(() => {
    if (!isGruposElim || !elimStageId) return {}
    const acc: Record<number, Match[]> = {}
    for (const m of matches) {
      if (m.stage_id !== elimStageId) continue
      if (m.bracket_slot === -2) continue  // bronze separado
      if (isElimBye(m)) continue
      ;(acc[m.round] ??= []).push(m)
    }
    return acc
  }, [isGruposElim, elimStageId, matches])

  const elimBronzeMatch = isGruposElim
    ? (matches.find((m) => m.stage_id === elimStageId && m.bracket_slot === -2) ?? null)
    : null

  const elimRounds = Object.keys(elimMatchesByRound).map(Number).sort((a, b) => a - b)
  const elimMaxRoundGE = elimRounds.length > 0 ? Math.max(...elimRounds) : 0

  // Bracket gerado para grupos_elim?
  const bracketMatches = matches.filter((m) => m.stage_id === elimStageId && (m.bracket_slot ?? 0) > 0)
  const bracketGenerated = bracketMatches.length > 0

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

      {canManage && (
        <ManageBar id={champ.id} basePath="/campeonatos" listPath="/campeonatos" />
      )}

      {/* Ativar campeonato (rascunho) — #3 */}
      {canManage && champ.status === 'rascunho' && (
        <div className="glass glass-card px-4 py-4 space-y-3" style={{ borderColor: 'rgba(205,253,81,0.25)' }}>
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-secondary/15 grid place-items-center shrink-0">
              <Rocket className="h-4 w-4 text-secondary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white/90">Campeonato em rascunho</p>
              <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
                Ative para gerar os jogos{isElim ? ' e o bracket' : ''} e torná-lo visível para todos.
              </p>
            </div>
          </div>
          {activateError && <p className="text-xs text-red-400/90">{activateError}</p>}
          <button
            type="button"
            onClick={handleActivate}
            disabled={activating}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-bold text-primary transition active:scale-[0.98] disabled:opacity-50"
          >
            {activating ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                Ativando…
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                Ativar campeonato
              </>
            )}
          </button>
        </div>
      )}

      {/* Hero compacto */}
      <div className="glass glass-card px-4 py-3.5 flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-secondary/15 grid place-items-center shrink-0">
          {isGruposElim ? (
            <Layers className="h-5 w-5 text-secondary" />
          ) : (
            <Trophy className="h-5 w-5 text-secondary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold text-white leading-snug truncate">{champ.name}</h1>
          <p className="text-xs text-white/40 mt-0.5">
            {FORMAT_LABEL[champ.format] ?? champ.format}
            {' · '}
            {UNIT_LABEL[champ.unit] ?? champ.unit}
            {isGruposElim && groups.length > 0 && ` · ${groups.length} grupos`}
            {!isGruposElim && stage && !isElim && ` · ${stage.rounds}× round-robin`}
            {(isElim || isGruposElim) && champ.has_third_place && ' · com 3º lugar'}
          </p>
          {startDateLabel && (
            <p className="flex items-center gap-1 text-[11px] text-white/35 mt-1">
              <CalendarDays className="h-3 w-3 shrink-0" />
              Início: {startDateLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {groupConversationId && champ.status === 'ativo' && (
            <Link
              href={`/mensagens/${groupConversationId}`}
              className="h-8 w-8 rounded-full bg-secondary/15 grid place-items-center text-secondary transition active:scale-90"
              title="Chat do campeonato"
            >
              <MessageSquare className="h-4 w-4" />
            </Link>
          )}
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${champBadge.cls}`}>
            {champBadge.label}
          </span>
        </div>
      </div>

      {/* ── Banner de campeão ── */}
      {champion && (
        <div className="glass glass-card px-4 py-4 flex items-center gap-3 border border-secondary/30 bg-secondary/5">
          <div className="h-11 w-11 rounded-full shrink-0 grid place-items-center bg-secondary/20 ring-2 ring-secondary/40 overflow-hidden">
            {champion.avatarUrl ? (
              <img src={champion.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Trophy className="h-5 w-5 text-secondary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-secondary/70">Campeão</p>
            <p className="text-base font-black text-secondary truncate leading-snug mt-0.5">
              {champion.name ?? 'Vencedor'}
            </p>
          </div>
          <Trophy className="h-6 w-6 text-secondary/50 shrink-0" />
        </div>
      )}

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

      {/* ── Aba: Grupos (grupos_elim) ── */}
      {activeTab === 'grupos' && isGruposElim && (
        <div className="reveal">
          <GroupsView
            championshipId={champ.id}
            champStatus={champ.status}
            groups={groups}
            participantGroups={participantGroups}
            initialStandings={initialStandings}
            participantInfo={participantInfo}
            participantAvatars={participantAvatars}
            currentUserParticipantId={currentUserParticipantId}
            gruposStageId={gruposStageId}
            elimStageId={elimStageId}
            onSwitchToBracket={() => setActiveTab('bracket')}
            offlineData={gruposOfflineData}
          />
        </div>
      )}

      {/* ── Aba: Bracket (eliminatória pura) ── */}
      {activeTab === 'bracket' && isElim && (
        <div className="reveal">
          <BracketView
            championshipId={champ.id}
            champStatus={champ.status}
            initialMatches={matches}
            participantInfo={participantInfo}
            participantAvatars={participantAvatars}
            stage={stage}
            hasThirdPlace={champ.has_third_place}
            canManage={canManage}
            currentUserParticipantId={currentUserParticipantId}
            initialStandings={initialStandings}
          />
        </div>
      )}

      {/* ── Aba: Bracket (grupos_elim) ── */}
      {activeTab === 'bracket' && isGruposElim && (
        <div className="reveal">
          {bracketGenerated ? (
            <BracketView
              championshipId={champ.id}
              champStatus={champ.status}
              initialMatches={bracketMatches}
              participantInfo={participantInfo}
              participantAvatars={participantAvatars}
              stage={elimStage ?? null}
              hasThirdPlace={champ.has_third_place}
              canManage={canManage}
              currentUserParticipantId={currentUserParticipantId}
              initialStandings={initialStandings}
              participantGroupLabels={participantGroupLabels}
            />
          ) : (
            <div
              className="glass glass-card px-5 py-10 text-center space-y-2"
              style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <GitMerge className="h-8 w-8 text-white/15 mx-auto" />
              <p className="text-sm font-medium text-white/35 mt-2">Bracket não gerado</p>
              <p className="text-xs text-white/20 max-w-xs mx-auto leading-relaxed">
                O bracket será gerado automaticamente ao término da fase de grupos.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('grupos')}
                className="mt-2 text-xs text-secondary/60 underline underline-offset-2"
              >
                Ver grupos →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Aba: Jogos (liga / outros) ── */}
      {activeTab === 'jogos' && !isGruposElim && (
        <div className="space-y-4 reveal">
          {isElim && elimMainMatches.length === 0 && !bronzeMatch ? (
            <div className="glass glass-card px-4 py-12 text-center">
              <p className="text-sm text-white/30">
                {champ.status === 'rascunho'
                  ? 'Ative o campeonato para gerar o bracket.'
                  : 'Nenhum jogo gerado ainda.'}
              </p>
            </div>
          ) : !isElim && matches.length === 0 ? (
            <div className="glass glass-card px-4 py-12 text-center">
              <p className="text-sm text-white/30">Nenhum jogo gerado ainda.</p>
            </div>
          ) : (
            <>
              {rounds.map((round) => {
                const roundMatches = byRound[round] ?? []
                if (roundMatches.length === 0) return null
                const sectionLabel = isElim
                  ? getEliminatoriaRoundLabel(round, elimMaxRound)
                  : isMultiRound
                    ? `Rodada ${round}`
                    : 'Confrontos'
                return (
                  <section key={round} className="space-y-2">
                    <SectionHeader label={sectionLabel} count={roundMatches.length} />
                    {roundMatches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        champId={champ.id}
                        stage={stage}
                        participantInfo={participantInfo}
                      />
                    ))}
                  </section>
                )
              })}

              {isElim && bronzeMatch && (
                <section className="space-y-2">
                  <div className="flex items-center gap-3 px-1">
                    <div className="flex items-center gap-1.5">
                      <Medal className="h-3 w-3 text-orange-400/70 shrink-0" />
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-orange-400/70 shrink-0">
                        Disputa de 3º lugar
                      </p>
                    </div>
                    <div className="flex-1 h-px bg-white/8" />
                  </div>
                  <MatchCard
                    match={bronzeMatch}
                    champId={champ.id}
                    stage={stage}
                    participantInfo={participantInfo}
                  />
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Aba: Jogos (grupos_elim) ── */}
      {activeTab === 'jogos' && isGruposElim && (
        <div className="space-y-5 reveal">
          {/* Fase de grupos */}
          {Object.keys(grupoMatchesByGroupId).length === 0 ? (
            <div className="glass glass-card px-4 py-10 text-center">
              <p className="text-sm text-white/30">Nenhum jogo gerado ainda.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Section header */}
              <div className="flex items-center gap-3 px-1">
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-white/30 shrink-0" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
                    Fase de Grupos
                  </p>
                </div>
                <div className="flex-1 h-px bg-white/8" />
              </div>

              {groups.map((group) => {
                const gMatches = grupoMatchesByGroupId[group.id] ?? []
                if (gMatches.length === 0) return null
                return (
                  <section key={group.id} className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-[10px] font-bold text-secondary/70">
                        Grupo {group.name}
                      </span>
                      <div className="flex-1 h-px bg-white/6" />
                      <span className="text-[10px] text-white/20">
                        {gMatches.length} {gMatches.length === 1 ? 'jogo' : 'jogos'}
                      </span>
                    </div>
                    {gMatches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        champId={champ.id}
                        stage={stage}
                        participantInfo={participantInfo}
                      />
                    ))}
                  </section>
                )
              })}
            </div>
          )}

          {/* Fase eliminatória (só aparece se bracket gerado) */}
          {bracketGenerated && (
            <div className="space-y-4">
              {/* Section header */}
              <div className="flex items-center gap-3 px-1">
                <div className="flex items-center gap-2">
                  <GitMerge className="h-3.5 w-3.5 text-white/30 shrink-0" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
                    Fase Eliminatória
                  </p>
                </div>
                <div className="flex-1 h-px bg-white/8" />
              </div>

              {elimRounds.map((round) => {
                const roundMs = elimMatchesByRound[round] ?? []
                if (roundMs.length === 0) return null
                const label = getEliminatoriaRoundLabel(round, elimMaxRoundGE)
                return (
                  <section key={round} className="space-y-2">
                    <SectionHeader label={label} count={roundMs.length} />
                    {roundMs.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        champId={champ.id}
                        stage={elimStage ?? null}
                        participantInfo={participantInfo}
                      />
                    ))}
                  </section>
                )
              })}

              {elimBronzeMatch && (
                <section className="space-y-2">
                  <div className="flex items-center gap-3 px-1">
                    <div className="flex items-center gap-1.5">
                      <Medal className="h-3 w-3 text-orange-400/70 shrink-0" />
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-orange-400/70">
                        Disputa de 3º lugar
                      </p>
                    </div>
                    <div className="flex-1 h-px bg-white/8" />
                  </div>
                  <MatchCard
                    match={elimBronzeMatch}
                    champId={champ.id}
                    stage={elimStage ?? null}
                    participantInfo={participantInfo}
                  />
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Aba: Classificação (liga / outros) ── */}
      {activeTab === 'classificacao' && !isElim && !isGruposElim && (
        <div className="reveal">
          <StandingsTable
            championshipId={champ.id}
            champStatus={champ.status}
            initialStandings={initialStandings}
            currentUserParticipantId={currentUserParticipantId}
            participantAvatars={participantAvatars}
            offlineData={offlineStandingsData}
          />
        </div>
      )}

      {/* ── Aba: Estatísticas ── */}
      {activeTab === 'estatisticas' && (
        <div className="reveal">
          <StatsTab
            standings={initialStandings}
            participantInfo={participantInfo}
            pointsWin={champ.points_win}
            pointsDraw={champ.points_draw}
            pointsLoss={champ.points_loss}
            offlineData={offlineStandingsData}
          />
        </div>
      )}
    </div>
  )
}
