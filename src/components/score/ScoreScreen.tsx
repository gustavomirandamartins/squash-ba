'use client'

/**
 * ScoreScreen — tela de placar offline-first.
 *
 * Suporta:
 *   - counting='set'    → placar por sets (toque incrementa/decrementa)
 *   - counting='tempo'  → cronômetro + placar numérico lado a lado
 *   - counting='pontos' → placar contínuo por pontos
 *
 * Extras:
 *   - Badge offline (amarelo) com contagem de ações pendentes
 *   - Banner de conflito (âmbar) com resolução local/servidor
 *   - A partida finaliza automaticamente pelo placar (sem confirmação manual)
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Wifi, WifiOff, AlertTriangle, User, ChevronDown, ChevronUp, Plus, Minus, RotateCcw, CalendarDays } from 'lucide-react'
import { useScoreEngine, type GameScore, type ConflictSnapshot, type ScoreEngineConfig } from '@/lib/score-engine/useScoreEngine'
import { CourtTimer } from '@/lib/score-engine/CourtTimer'
import { createClient } from '@/utils/supabase/client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type SideInfo = {
  name: string | null
  avatarUrl: string | null
}

export type ScoreScreenProps = {
  matchId: string
  backHref: string
  sideA: SideInfo
  sideB: SideInfo
  counting: string       // 'sets' | 'tempo' | 'pontos'
  setsToPlay: number
  pointsPerSet: number
  winByTwo: boolean
  setDrawEnabled: boolean
  timeMinutes: number | null
  canManage: boolean
  /** Server Action — reabre partida finalizada (apenas organizers/admins) */
  onReopenMatch?: () => Promise<{ error: string | null }>
  /** Data/hora agendada da partida (ISO) ou null */
  scheduledAt?: string | null
  /** Server Action — atualiza a data do jogo (scheduled_at) */
  onUpdateSchedule?: (iso: string | null) => Promise<{ error: string | null }>
  // SSR initial state
  initialGames: GameScore[]
  initialStatus: string
  initialResult: string | null
  initialConflictSnapshot: ConflictSnapshot | null
}

// ─── Avatar helper ────────────────────────────────────────────────────────────

function PlayerAvatar({ info, size = 44 }: { info: SideInfo; size?: number }) {
  if (info.avatarUrl) {
    return (
      <Image
        src={info.avatarUrl}
        alt={info.name ?? ''}
        width={size}
        height={size}
        className="rounded-full object-cover ring-2 ring-white/15 shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full bg-secondary/15 grid place-items-center text-secondary font-bold shrink-0 ring-2 ring-secondary/20"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {info.name ? info.name.charAt(0).toUpperCase() : <User style={{ width: size * 0.5, height: size * 0.5 }} />}
    </div>
  )
}

// ─── Offline badge ────────────────────────────────────────────────────────────

function OfflineBadge({ pendingCount }: { pendingCount: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-yellow-500/15 border border-yellow-500/25 px-2.5 py-1">
      <WifiOff className="h-3 w-3 text-yellow-400 shrink-0" />
      <span className="text-[10px] font-semibold text-yellow-400">
        Offline{pendingCount > 0 ? ` — ${pendingCount} pendente${pendingCount > 1 ? 's' : ''}` : ''}
      </span>
    </div>
  )
}

// ─── Online badge (syncing) ───────────────────────────────────────────────────

function SyncingBadge({ pendingCount }: { pendingCount: number }) {
  if (pendingCount === 0) return null
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-secondary/10 border border-secondary/20 px-2.5 py-1">
      <Wifi className="h-3 w-3 text-secondary/70 shrink-0" />
      <span className="text-[10px] font-semibold text-secondary/70">
        Sincronizando {pendingCount}…
      </span>
    </div>
  )
}

// ─── Conflict banner ──────────────────────────────────────────────────────────

function ConflictBanner({
  snapshot,
  onResolve,
  busy,
}: {
  snapshot: ConflictSnapshot | null
  onResolve: (side: 'local' | 'server') => void
  busy: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="glass glass-card overflow-hidden border border-amber-500/30 bg-amber-500/[0.04]">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-amber-500/15 grid place-items-center shrink-0 mt-0.5">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-300 leading-snug">
            Conflito detectado
          </p>
          <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
            Dois dispositivos editaram este jogo. Escolha qual placar manter.
          </p>

          {snapshot && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-400/70 hover:text-amber-400 transition"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Placar do servidor
            </button>
          )}

          {expanded && snapshot && (
            <div className="mt-2 space-y-1">
              {snapshot.games.map((g) => (
                <p key={g.game_number} className="text-xs text-white/40 font-mono">
                  Set {g.game_number}: {g.score_a} × {g.score_b}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Botões de resolução */}
      <div className="px-4 pb-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onResolve('local')}
          className="flex-1 rounded-full bg-secondary/20 px-3 py-2 text-xs font-semibold text-secondary transition active:scale-95 disabled:opacity-40"
        >
          Usar este dispositivo
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onResolve('server')}
          className="flex-1 rounded-full bg-white/8 px-3 py-2 text-xs font-semibold text-white/70 transition active:scale-95 disabled:opacity-40"
        >
          Usar servidor
        </button>
      </div>
    </div>
  )
}

// ─── Game set row ─────────────────────────────────────────────────────────────

function GameRow({
  game,
  isActive,
  onReopen,
}: {
  game: GameScore
  isActive: boolean
  onReopen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onReopen}
      className={[
        'w-full flex items-center gap-3 px-3 py-2 rounded-xl transition',
        isActive
          ? 'bg-secondary/10 ring-1 ring-secondary/30'
          : 'bg-white/[0.03] hover:bg-white/[0.06]',
      ].join(' ')}
    >
      <span
        className={`text-[10px] font-bold uppercase tracking-wider w-10 shrink-0 text-left ${
          isActive ? 'text-secondary' : 'text-white/30'
        }`}
      >
        Set {game.game_number}
      </span>
      <span
        className={`flex-1 text-sm font-black tabular-nums text-center tracking-tight ${
          isActive ? 'text-white' : 'text-white/50'
        }`}
      >
        {game.score_a}
        <span className="text-white/20 mx-1">–</span>
        {game.score_b}
      </span>
      {isActive && (
        <span className="h-1.5 w-1.5 rounded-full bg-secondary shrink-0 animate-pulse" />
      )}
    </button>
  )
}

// ─── Tap zone (toque = ponto) ─────────────────────────────────────────────────

function TapZone({
  side,
  score,
  name,
  avatarUrl,
  onIncrement,
  onDecrement,
  disabled,
  isWinner,
}: {
  side: 'a' | 'b'
  score: number
  name: string | null
  avatarUrl: string | null
  onIncrement: () => void
  onDecrement: () => void
  disabled?: boolean
  isWinner?: boolean
}) {
  const isLeft = side === 'a'

  return (
    <div
      className={[
        'flex-1 flex flex-col items-center select-none',
        isLeft ? 'pr-2' : 'pl-2',
      ].join(' ')}
    >
      {/* Avatar + nome */}
      <div className="flex flex-col items-center gap-1.5 mb-4">
        <PlayerAvatar info={{ name, avatarUrl }} size={40} />
        <span
          className={`text-[11px] font-semibold leading-tight text-center truncate max-w-[90px] ${
            isWinner ? 'text-secondary' : 'text-white/60'
          }`}
        >
          {name ?? '—'}
        </span>
      </div>

      {/* Placar grande — toque incrementa */}
      <button
        type="button"
        disabled={disabled}
        onClick={onIncrement}
        className={[
          'w-full h-32 rounded-2xl grid place-items-center transition-all duration-150',
          'active:scale-[0.96] active:brightness-110',
          isWinner
            ? 'bg-secondary/15 ring-2 ring-secondary/40 shadow-[0_0_24px_rgba(205,253,81,0.15)]'
            : 'bg-white/[0.06] ring-1 ring-white/8',
          disabled ? 'opacity-40 cursor-not-allowed' : '',
        ].join(' ')}
      >
        <span
          className={`text-6xl font-black tabular-nums leading-none ${
            isWinner ? 'text-secondary' : 'text-white'
          }`}
        >
          {score}
        </span>
      </button>

      {/* Controles +/- */}
      <div className="flex gap-2 mt-2.5">
        <button
          type="button"
          disabled={disabled || score <= 0}
          onClick={onDecrement}
          className="h-8 w-8 rounded-full bg-white/[0.06] grid place-items-center text-white/40 hover:text-white/70 transition active:scale-90 disabled:opacity-25"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onIncrement}
          className="h-8 w-8 rounded-full bg-secondary/15 grid place-items-center text-secondary transition active:scale-90 disabled:opacity-25"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── ScoreScreen ──────────────────────────────────────────────────────────────

export function ScoreScreen({
  matchId,
  backHref,
  sideA,
  sideB,
  counting,
  setsToPlay,
  pointsPerSet,
  winByTwo,
  setDrawEnabled,
  timeMinutes,
  canManage,
  onReopenMatch,
  scheduledAt,
  onUpdateSchedule,
  initialGames,
  initialStatus,
  initialResult,
  initialConflictSnapshot,
}: ScoreScreenProps) {
  const engineConfig: ScoreEngineConfig = {
    sets_to_play: setsToPlay,
    points_per_set: pointsPerSet,
    win_by_two: winByTwo,
    set_draw_enabled: setDrawEnabled,
    counting,
    initialGames,
    initialStatus,
    initialResult,
    initialConflictSnapshot,
  }

  const engine = useScoreEngine(matchId, engineConfig)
  const {
    games,
    status,
    result,
    currentGame,
    busy,
    isOffline,
    pendingCount,
    hasConflict,
    conflictSnapshot,
    increment,
    decrement,
    advanceGame,
    reopenGame,
    resolveConflict,
  } = engine

  const isTempo   = counting === 'tempo'
  // 'set' (singular) é o valor persistido no banco; aceita também 'sets' para compatibilidade
  const isSets    = counting === 'set' || counting === 'sets'
  const isFinished = status === 'finalizado'
  const editable = canManage && !isFinished && !hasConflict

  const currentGameData = games.find((g) => g.game_number === currentGame) ?? {
    game_number: currentGame,
    score_a: 0,
    score_b: 0,
  }

  const winnerA = result === 'lado_a'
  const winnerB = result === 'lado_b'

  // A partida finaliza AUTOMATICAMENTE quando o placar decide (mais sets vence;
  // empate só quando a fase permite e o resultado dá igual). Sem confirmação manual.

  const router = useRouter()
  const [reopening, setReopening] = useState(false)
  const [reopenError, setReopenError] = useState<string | null>(null)

  async function handleReopen() {
    if (!onReopenMatch || reopening) return
    setReopening(true)
    setReopenError(null)
    try {
      const res = await onReopenMatch()
      if (res.error) {
        setReopenError(res.error)
        setReopening(false)
        return
      }
      router.refresh()
    } catch {
      setReopenError('Não foi possível reabrir a partida.')
      setReopening(false)
    }
  }

  // ── Data do jogo (#2) ──────────────────────────────────────────────────────
  const [scheduledLocal, setScheduledLocal] = useState<string | null>(scheduledAt ?? null)
  const [savingDate, setSavingDate] = useState(false)
  const autoSetRef = useRef(false)

  // 'YYYY-MM-DD' para o <input type="date"> (em horário local)
  function isoToDateInput(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const saveSchedule = useCallback(
    async (iso: string | null) => {
      if (!onUpdateSchedule) return
      setSavingDate(true)
      setScheduledLocal(iso)
      try {
        await onUpdateSchedule(iso)
      } catch {
        // offline ou falha de rede: mantém o valor local (data é informativa)
      } finally {
        setSavingDate(false)
      }
    },
    [onUpdateSchedule],
  )

  function handleDateChange(value: string) {
    if (!value) { void saveSchedule(null); return }
    // Salva ao meio-dia local para evitar “voltar um dia” por fuso ao reexibir
    const iso = new Date(`${value}T12:00:00`).toISOString()
    void saveSchedule(iso)
  }

  // Define automaticamente a data de hoje ao iniciar o jogo, se ainda não houver.
  useEffect(() => {
    if (autoSetRef.current) return
    if (!canManage || !onUpdateSchedule) return
    if (scheduledLocal) return
    if (status === 'em_andamento' || status === 'finalizado') {
      autoSetRef.current = true
      const iso = new Date(new Date().setHours(12, 0, 0, 0)).toISOString()
      void saveSchedule(iso)
    }
  }, [status, canManage, onUpdateSchedule, scheduledLocal, saveSchedule])

  // Supabase client
  const [supabase] = useState(() => createClient())

  // Salva duration_seconds no Supabase ao encerrar cronômetro
  const handleTimerStop = useCallback(
    async (seconds: number) => {
      await supabase.from('matches').update({ duration_seconds: seconds }).eq('id', matchId)
    },
    [supabase, matchId],
  )

  return (
    <div className="px-5 py-4 space-y-4 max-w-md mx-auto">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Link>

        {/* Status badges */}
        <div className="flex items-center gap-2">
          {isOffline && <OfflineBadge pendingCount={pendingCount} />}
          {!isOffline && pendingCount > 0 && <SyncingBadge pendingCount={pendingCount} />}
          {isFinished && (
            <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-[11px] font-medium text-white/40">
              Encerrado
            </span>
          )}
          {status === 'em_andamento' && !isOffline && (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary animate-pulse" />
              <span className="text-[11px] font-semibold text-secondary">Ao vivo</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Data do jogo (#2) ── */}
      {onUpdateSchedule && canManage ? (
        <div className="glass glass-card px-4 py-2.5 flex items-center gap-2.5">
          <CalendarDays className="h-4 w-4 text-secondary/70 shrink-0" />
          <span className="text-xs font-medium text-white/55 shrink-0">Data do jogo</span>
          <input
            type="date"
            value={isoToDateInput(scheduledLocal)}
            onChange={(e) => handleDateChange(e.target.value)}
            className="ml-auto bg-white/[0.06] rounded-lg px-2.5 py-1.5 text-sm text-white outline-none [color-scheme:dark]"
          />
          {savingDate && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/60 shrink-0" />
          )}
        </div>
      ) : scheduledLocal ? (
        <div className="glass glass-card px-4 py-2.5 flex items-center gap-2.5">
          <CalendarDays className="h-4 w-4 text-secondary/70 shrink-0" />
          <span className="text-xs font-medium text-white/55">Data do jogo</span>
          <span className="ml-auto text-sm text-white/80">
            {new Date(scheduledLocal).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
      ) : null}

      {/* ── Conflict banner ── */}
      {hasConflict && (
        <ConflictBanner
          snapshot={conflictSnapshot}
          onResolve={resolveConflict}
          busy={busy}
        />
      )}

      {/* ── Modo TEMPO: cronômetro + placares lado a lado ── */}
      {isTempo ? (
        <div className="space-y-4">
          <div className="glass glass-card px-4 py-6 flex flex-col items-center gap-4">
            <CourtTimer
              initialSeconds={0}
              onStop={handleTimerStop}
            />
          </div>

          {/* Placares para modo tempo */}
          <div className="glass glass-card px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25 text-center mb-3">
              Placar{timeMinutes ? ` · ${timeMinutes} min` : ''}
            </p>
            <div className="flex gap-3">
              <TapZone
                side="a"
                score={currentGameData.score_a}
                name={sideA.name}
                avatarUrl={sideA.avatarUrl}
                onIncrement={() => void increment('a')}
                onDecrement={() => void decrement('a')}
                disabled={!editable}
                isWinner={winnerA}
              />
              <div className="flex items-center shrink-0 self-center">
                <span className="text-2xl font-black text-white/20">×</span>
              </div>
              <TapZone
                side="b"
                score={currentGameData.score_b}
                name={sideB.name}
                avatarUrl={sideB.avatarUrl}
                onIncrement={() => void increment('b')}
                onDecrement={() => void decrement('b')}
                disabled={!editable}
                isWinner={winnerB}
              />
            </div>
          </div>
        </div>
      ) : (
        /* ── Modo SETS / PONTOS: tap zones por set ── */
        <div className="space-y-3">
          {/* Placar do set atual */}
          <div className="glass glass-card px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25 text-center mb-3">
              {counting === 'pontos' ? 'Pontos' : `Set ${currentGame}`}
              {pointsPerSet > 0 && ` · até ${pointsPerSet}${winByTwo ? '+2' : ''}`}
            </p>
            <div className="flex gap-3">
              <TapZone
                side="a"
                score={currentGameData.score_a}
                name={sideA.name}
                avatarUrl={sideA.avatarUrl}
                onIncrement={() => void increment('a')}
                onDecrement={() => void decrement('a')}
                disabled={!editable}
                isWinner={winnerA}
              />
              <div className="flex items-center shrink-0 self-center">
                <div className="w-px h-20 bg-white/10 rounded-full" />
              </div>
              <TapZone
                side="b"
                score={currentGameData.score_b}
                name={sideB.name}
                avatarUrl={sideB.avatarUrl}
                onIncrement={() => void increment('b')}
                onDecrement={() => void decrement('b')}
                disabled={!editable}
                isWinner={winnerB}
              />
            </div>
          </div>

          {/* Histórico de sets */}
          {games.length > 0 && (
            <div className="glass glass-card px-3 py-2.5 space-y-1">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-white/20 px-1 mb-1.5">
                Sets
              </p>
              {games.map((g) => (
                <GameRow
                  key={g.game_number}
                  game={g}
                  isActive={g.game_number === currentGame}
                  onReopen={() => void reopenGame(g.game_number)}
                />
              ))}
            </div>
          )}

          {/* Avançar set — corrigido: 'set' (sem 's') é o valor do banco */}
          {editable && isSets && games.length > 0 && games.length < setsToPlay && (
            <button
              type="button"
              onClick={() => void advanceGame()}
              className="w-full glass glass-card py-3 text-xs font-semibold text-white/40 hover:text-white/70 transition text-center rounded-2xl"
            >
              ↓ Encerrar set e avançar
            </button>
          )}
        </div>
      )}

      {/* ── Resultado final ── */}
      {isFinished && (
        <div className="glass glass-card px-4 py-4 text-center space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Resultado final
          </p>
          <p className="text-base font-black text-secondary">
            {result === 'empate'
              ? 'Empate'
              : result === 'lado_a'
                ? (sideA.name ?? 'Lado A')
                : (sideB.name ?? 'Lado B')} venceu
          </p>
        </div>
      )}

      {/* ── Reabrir partida (só para organizadores/admins) ── */}
      {isFinished && onReopenMatch && (
        <div className="space-y-1.5">
          <button
            type="button"
            disabled={reopening}
            onClick={() => void handleReopen()}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] py-3 text-xs font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white/75 active:scale-95 disabled:opacity-40"
          >
            {reopening ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
                Reabrindo…
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                Reabrir partida
              </>
            )}
          </button>
          {reopenError && (
            <p className="text-[11px] text-red-400/80 text-center">{reopenError}</p>
          )}
        </div>
      )}

      {/* ── Error ── */}
      {engine.error && (
        <p className="text-xs text-red-400/80 text-center">{engine.error}</p>
      )}
    </div>
  )
}
