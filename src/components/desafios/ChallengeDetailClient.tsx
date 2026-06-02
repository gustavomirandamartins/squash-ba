'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, Clock, Swords, User, Check, X } from 'lucide-react'
import { ManageBar } from '@/components/ManageBar'
import { getQueuedGames } from '@/lib/score-engine/SyncEngine'
import { resolveMatch, mergeGames, type StageCfg } from '@/lib/standings/compute'
import { createClient } from '@/utils/supabase/client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ChallengeParticipant = {
  id: string
  enrollment_status: string
  full_name: string | null
  avatar_url: string | null
}

export type ChallengeMatch = {
  id: string
  round: number
  status: string
  result: string | null
  side_a_participant_id: string | null
  side_b_participant_id: string | null
  score_a: number
  score_b: number
  /** games crus — para recálculo offline (opcional) */
  match_games?: Array<{ game_number: number; score_a: number; score_b: number }>
}

export type ChallengeData = {
  id: string
  name: string
  status: string
  format: string
  unit: string
  rounds: number
}

type Props = {
  challenge: ChallengeData
  participants: ChallengeParticipant[]
  matches: ChallengeMatch[]
  currentUserParticipantId: string | null
  isCreator: boolean
  canManage?: boolean
  /** config da fase p/ recálculo offline ao vivo (opcional) */
  stage?: StageCfg
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHAMP_STATUS: Record<string, { label: string; cls: string }> = {
  rascunho:  { label: 'Aguardando aceite', cls: 'bg-yellow-500/15 text-yellow-400/80' },
  ativo:     { label: 'Em andamento',      cls: 'bg-secondary/20 text-secondary' },
  encerrado: { label: 'Encerrado',         cls: 'bg-white/5 text-white/30' },
}

const MATCH_STATUS: Record<string, { label: string; cls: string; dot?: boolean }> = {
  agendado:     { label: 'A realizar',  cls: 'text-white/30' },
  em_andamento: { label: 'Ao vivo',     cls: 'text-secondary', dot: true },
  finalizado:   { label: 'Encerrado',   cls: 'text-white/35' },
}

function Avatar({ p, size = 36 }: { p: ChallengeParticipant | undefined; size?: number }) {
  if (!p) {
    return (
      <div
        className="rounded-full bg-white/8 grid place-items-center shrink-0"
        style={{ width: size, height: size }}
      >
        <User className="text-white/25" style={{ width: size * 0.45, height: size * 0.45 }} />
      </div>
    )
  }
  if (p.avatar_url) {
    return (
      <Image
        src={p.avatar_url}
        alt={p.full_name ?? ''}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0 ring-1 ring-white/10"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full bg-secondary/15 grid place-items-center text-xs font-bold text-secondary shrink-0"
      style={{ width: size, height: size }}
    >
      {(p.full_name ?? '?').charAt(0).toUpperCase()}
    </div>
  )
}

// ─── Pending 1v1 (aguardando aceite) ─────────────────────────────────────────

function PendingHero({
  challenge,
  participants,
  currentUserParticipantId,
}: {
  challenge: ChallengeData
  participants: ChallengeParticipant[]
  currentUserParticipantId: string | null
}) {
  const pA = participants.find((p) => p.enrollment_status === 'confirmado')
  const pB = participants.find((p) => p.enrollment_status === 'pendente')

  // O usuário logado é o convidado pendente?
  const isInvitee = !!pB && pB.id === currentUserParticipantId

  const [busy, setBusy] = useState<null | 'accept' | 'decline'>(null)
  const [error, setError] = useState<string | null>(null)

  async function respond(accept: boolean) {
    if (busy) return
    setBusy(accept ? 'accept' : 'decline')
    setError(null)
    try {
      const supabase = createClient()
      const { error: rpcError } = await supabase.rpc('respond_challenge_invite', {
        _championship_id: challenge.id,
        _accept: accept,
      })
      if (rpcError) {
        setError('Não foi possível responder ao convite. Tente novamente.')
        setBusy(null)
        return
      }
      window.location.reload()
    } catch {
      setError('Não foi possível responder ao convite. Tente novamente.')
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Confronto hero */}
      <div className="glass glass-card px-5 py-6">
        <div className="flex items-center gap-3">
          {/* Lado A */}
          <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
            <Avatar p={pA} size={52} />
            <p className="text-xs font-semibold text-white/80 text-center truncate w-full">
              {pA?.full_name ?? '—'}
            </p>
            <span className="text-[10px] font-semibold text-secondary/70 uppercase tracking-wider">
              Criador
            </span>
          </div>

          {/* VS */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <Swords className="h-6 w-6 text-secondary/60" />
            <span className="text-[10px] font-bold text-white/25 tracking-widest uppercase">vs</span>
          </div>

          {/* Lado B */}
          <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
            <div className="relative">
              <Avatar p={pB} size={52} />
              <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-yellow-500/20 border border-yellow-500/30 grid place-items-center">
                <Clock className="h-2.5 w-2.5 text-yellow-400" />
              </span>
            </div>
            <p className="text-xs font-semibold text-white/60 text-center truncate w-full">
              {pB?.full_name ?? '—'}
            </p>
            <span className="text-[10px] font-semibold text-yellow-400/60 uppercase tracking-wider">
              Aguardando
            </span>
          </div>
        </div>
      </div>

      {/* Status card / Ação do convidado */}
      {isInvitee ? (
        <div className="glass glass-card px-4 py-4 space-y-3">
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-white/85">Você foi desafiado!</p>
            <p className="text-xs text-white/45 leading-relaxed max-w-[280px] mx-auto">
              <span className="text-white/65">{pA?.full_name ?? 'O criador'}</span> quer jogar com você.
              Aceite para começar o desafio.
            </p>
          </div>
          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void respond(true)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-secondary py-3 text-sm font-bold text-primary transition active:scale-95 disabled:opacity-50"
            >
              {busy === 'accept' ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Aceitar
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void respond(false)}
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-sm font-semibold text-white/65 transition active:scale-95 hover:bg-white/8 disabled:opacity-50"
            >
              {busy === 'decline' ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
              ) : (
                <X className="h-4 w-4" />
              )}
              Recusar
            </button>
          </div>
        </div>
      ) : (
        <div className="glass glass-card px-4 py-4 space-y-2 text-center">
          <div className="h-9 w-9 rounded-full bg-yellow-500/10 grid place-items-center mx-auto">
            <Clock className="h-4.5 w-4.5 text-yellow-400" />
          </div>
          <p className="text-sm font-semibold text-white/80">Aguardando confirmação</p>
          <p className="text-xs text-white/40 leading-relaxed max-w-[260px] mx-auto">
            O desafio começa assim que{' '}
            <span className="text-white/65">{pB?.full_name ?? 'o oponente'}</span> aceitar o convite.
          </p>
        </div>
      )}

      {/* Regras resumidas */}
      <div className="glass glass-card px-4 py-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-2.5">
          Regras
        </p>
        <p className="text-sm text-white/60">
          {challenge.rounds === 1 ? '1 partida' : `${challenge.rounds} partidas`}
        </p>
      </div>
    </div>
  )
}

// ─── Match card (1v1 ativo) ───────────────────────────────────────────────────

function MatchCard({
  match,
  challengeId,
  participants,
}: {
  match: ChallengeMatch
  challengeId: string
  participants: ChallengeParticipant[]
}) {
  const pA = match.side_a_participant_id
    ? participants.find((p) => p.id === match.side_a_participant_id)
    : undefined
  const pB = match.side_b_participant_id
    ? participants.find((p) => p.id === match.side_b_participant_id)
    : undefined

  const st = MATCH_STATUS[match.status] ?? MATCH_STATUS.agendado
  const winnerA = match.result === 'lado_a'
  const winnerB = match.result === 'lado_b'
  const hasScore = match.status !== 'agendado'
  const sortedGames = [...(match.match_games ?? [])].sort((a, b) => a.game_number - b.game_number)
  const showGameDetail = match.status === 'finalizado' && sortedGames.length >= 1

  return (
    <Link
      href={`/desafios/${challengeId}/jogos/${match.id}`}
      className="glass glass-card px-4 py-3.5 flex flex-col gap-2 active:scale-[0.985] transition-transform"
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar p={pA} size={28} />
          <span className={`text-[13px] leading-tight truncate font-medium ${winnerA ? 'text-secondary' : 'text-white/80'}`}>
            {pA?.full_name ?? '—'}
          </span>
        </div>
        <div className="flex flex-col items-center shrink-0 w-14 text-center">
          {hasScore ? (
            <span className={`text-base font-bold tabular-nums tracking-tight ${match.status === 'finalizado' ? 'text-white' : 'text-white/70'}`}>
              {match.score_a}–{match.score_b}
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-white/20 tracking-[0.15em] uppercase">vs</span>
          )}
          {showGameDetail && (
            <span className="text-[10px] text-white/30 tabular-nums mt-0.5 leading-tight">
              {sortedGames.map((g) => `${g.score_a}·${g.score_b}`).join('  ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className={`text-[13px] leading-tight truncate text-right font-medium ${winnerB ? 'text-secondary' : 'text-white/80'}`}>
            {pB?.full_name ?? '—'}
          </span>
          <Avatar p={pB} size={28} />
        </div>
      </div>
      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-1.5">
          {st.dot && <span className="h-1.5 w-1.5 rounded-full bg-secondary inline-block" />}
          <span className={`text-[11px] font-medium ${st.cls}`}>{st.label}</span>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-white/20 shrink-0" />
      </div>
    </Link>
  )
}

// ─── Active 1v1 ───────────────────────────────────────────────────────────────

type TabId = 'jogos' | 'estatisticas'

function Active1v1({
  challenge,
  participants,
  matches,
}: {
  challenge: ChallengeData
  participants: ChallengeParticipant[]
  matches: ChallengeMatch[]
}) {
  const [tab, setTab] = useState<TabId>('jogos')
  const pA = participants[0]
  const pB = participants[1]

  // Conta vitórias para cada lado
  const winsA = matches.filter((m) => m.result === 'lado_a').length
  const winsB = matches.filter((m) => m.result === 'lado_b').length
  const played = matches.filter((m) => m.status === 'finalizado').length
  const total = matches.length
  const threshold = Math.ceil(challenge.rounds / 2)

  return (
    <div className="space-y-4">
      {/* Mini placar do desafio */}
      <div className="glass glass-card px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <Avatar p={pA} size={40} />
            <p className="text-xs font-semibold text-white/75 truncate w-full text-center">
              {pA?.full_name ?? '—'}
            </p>
          </div>
          <div className="shrink-0 text-center px-2">
            <div className="text-2xl font-black text-white tabular-nums tracking-tight">
              {winsA}
              <span className="text-white/25 mx-1.5">–</span>
              {winsB}
            </div>
            <p className="text-[10px] text-white/30 mt-0.5">
              {played}/{total} jogadas · vence com {threshold}
            </p>
          </div>
          <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            <Avatar p={pB} size={40} />
            <p className="text-xs font-semibold text-white/75 truncate w-full text-center">
              {pB?.full_name ?? '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="glass glass-pill p-1 flex gap-0.5">
        {(['jogos', 'estatisticas'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-full text-xs font-semibold transition-all duration-200 ${
              tab === t
                ? 'bg-secondary text-primary'
                : 'text-white/40 hover:text-white/65'
            }`}
          >
            {t === 'jogos' ? 'Jogos' : 'Estatísticas'}
          </button>
        ))}
      </div>

      {tab === 'jogos' && (
        <div className="space-y-2 reveal">
          {matches.length === 0 ? (
            <div className="glass glass-card px-4 py-10 text-center">
              <p className="text-sm text-white/30">Nenhum jogo gerado ainda.</p>
            </div>
          ) : (
            matches.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                challengeId={challenge.id}
                participants={participants}
              />
            ))
          )}
        </div>
      )}

      {tab === 'estatisticas' && (
        <div className="reveal">
          <div className="glass glass-card px-4 py-10 text-center space-y-1.5">
            <p className="text-sm font-medium text-white/35">Estatísticas</p>
            <p className="text-xs text-white/20">Disponível após as primeiras partidas.</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ChallengeDetailClient({
  challenge,
  participants,
  matches,
  currentUserParticipantId,
  canManage = false,
  stage,
}: Props) {
  const badge = CHAMP_STATUS[challenge.status] ?? CHAMP_STATUS.rascunho
  const isPending = challenge.status === 'rascunho'
  const isActive = challenge.status === 'ativo'

  // Offline → recalcula resultado/placar de cada jogo a partir do snapshot +
  // fila de placares (motor offline). Online usa os valores do servidor (SSR).
  const [effectiveMatches, setEffectiveMatches] = useState<ChallengeMatch[]>(matches)

  const recompute = useCallback(async () => {
    if (!stage) { setEffectiveMatches(matches); return }
    const out = await Promise.all(
      matches.map(async (m) => {
        const queued = await getQueuedGames(m.id)
        const games = mergeGames(m.match_games ?? [], queued)
        const r = resolveMatch(games, stage)
        return {
          ...m,
          score_a: r.setsA,
          score_b: r.setsB,
          result: r.result,
          status: r.finalized ? 'finalizado' : games.length > 0 ? 'em_andamento' : m.status,
        }
      }),
    )
    setEffectiveMatches(out)
  }, [matches, stage])

  useEffect(() => {
    const isOff = typeof navigator !== 'undefined' && !navigator.onLine
    if (isOff) void recompute()
    else setEffectiveMatches(matches)

    const onOnline = () => setEffectiveMatches(matches)
    const onOffline = () => void recompute()
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [matches, recompute])

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Voltar */}
      <Link
        href="/jogos"
        className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition"
      >
        <ChevronLeft className="h-4 w-4" />
        Jogos
      </Link>

      {canManage && (
        <ManageBar id={challenge.id} basePath="/desafios" listPath="/jogos" />
      )}

      {/* Hero compacto */}
      <div className="glass glass-card px-4 py-3.5 flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-secondary/15 grid place-items-center shrink-0">
          <Swords className="h-5 w-5 text-secondary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold text-white leading-snug truncate">{challenge.name}</h1>
          <p className="text-xs text-white/40 mt-0.5">
            Desafio 1v1
            {` · ${challenge.rounds} ${challenge.rounds === 1 ? 'partida' : 'partidas'}`}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {/* Conteúdo por estado */}
      {isPending && (
        <PendingHero
          challenge={challenge}
          participants={participants}
          currentUserParticipantId={currentUserParticipantId}
        />
      )}
      {isActive && (
        <Active1v1 challenge={challenge} participants={participants} matches={effectiveMatches} />
      )}
      {challenge.status === 'encerrado' && (
        <Active1v1 challenge={challenge} participants={participants} matches={effectiveMatches} />
      )}
    </div>
  )
}
