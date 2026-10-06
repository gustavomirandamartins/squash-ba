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
import { useAppRouter } from '@/lib/offline/use-app-router'
import { shellNavigate } from '@/lib/offline/shell-nav'
import { ChevronLeft, Wifi, WifiOff, AlertTriangle, User, ChevronDown, ChevronUp, Plus, Minus, RotateCcw, CalendarDays, Flag, Square, UserX } from 'lucide-react'
import { useScoreEngine, type GameScore, type ConflictSnapshot, type ScoreEngineConfig } from '@/lib/score-engine/useScoreEngine'
import { CourtTimer } from '@/lib/score-engine/CourtTimer'
import { clearMatch, finalizeMatch, finishTimer, getQueuedMatchState, reopenMatch, setSchedule, setSyncMeta, type FinalizeInput } from '@/lib/score-engine/SyncEngine'

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
  /**
   * Pode reabrir a partida finalizada (organizador; ou participante, pela RPC
   * reopen_match_by_participant). Vai pela fila — funciona offline.
   */
  canReopen?: boolean
  /** Pode limpar todos os dados da partida (placar + cronômetro) (#5). Pela fila. */
  canClear?: boolean
  /** Data/hora agendada da partida (ISO) ou null */
  scheduledAt?: string | null
  /** Pode mudar a data do jogo (scheduled_at). Pela fila. */
  canSchedule?: boolean
  /** Segundos já acumulados no cronômetro (modo tempo) — evita reset ao voltar à página */
  initialDuration?: number
  /**
   * true  → usuário é organizer/admin → usa finalize_match_manual + pode ver W.O.
   * false → usuário é só participante → usa finalize_match_by_participant; sem W.O.
   */
  isOrganizer?: boolean
  /**
   * W.O. duplo (os dois lados faltaram → ninguém pontua). Desligado em partidas de
   * mata-mata: alguém precisa avançar na chave.
   */
  allowDoubleWo?: boolean
  // SSR initial state
  initialGames: GameScore[]
  initialStatus: string
  initialResult: string | null
  initialConflictSnapshot: ConflictSnapshot | null
  initialIsWo?: boolean
  initialIsDoubleWo?: boolean
}

// ─── Avatar helper ────────────────────────────────────────────────────────────

export function PlayerAvatar({ info, size = 44 }: { info: SideInfo; size?: number }) {
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

export function GameRow({
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

export function TapZone({
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
        aria-label={`Ponto para ${name ?? (isLeft ? 'o lado A' : 'o lado B')}`}
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
          aria-label={`Tirar ponto de ${name ?? (isLeft ? 'o lado A' : 'o lado B')}`}
          className="h-8 w-8 rounded-full bg-white/[0.06] grid place-items-center text-white/40 hover:text-white/70 transition active:scale-90 disabled:opacity-25"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onIncrement}
          aria-label={`Somar ponto para ${name ?? (isLeft ? 'o lado A' : 'o lado B')}`}
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
  canReopen = false,
  canClear = false,
  scheduledAt,
  canSchedule = false,
  initialGames,
  initialStatus,
  initialResult,
  initialConflictSnapshot,
  initialDuration,
  isOrganizer = false,
  allowDoubleWo = true,
  initialIsWo = false,
  initialIsDoubleWo = false,
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
    initialIsWo,
    initialIsDoubleWo,
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
    isWo,
    isDoubleWo,
    increment,
    decrement,
    advanceGame,
    reopenGame,
    resolveConflict,
    refresh,
  } = engine

  // Ref para acessar games atuais dentro de callbacks sem closure stale
  const gamesRef = useRef(games)
  useEffect(() => { gamesRef.current = games }, [games])

  // Estado otimista: ao chamar "Encerrar partida" exibimos o resultado imediatamente,
  // sem esperar o realtime do servidor (que pode demorar 1-2 s).
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null)
  const [optimisticResult, setOptimisticResult] = useState<string | null>(null)
  const [optimisticWo, setOptimisticWo] = useState<'none' | 'wo' | 'double_wo' | null>(null)
  const displayStatus = optimisticStatus ?? status
  // optimisticResult só vale com optimisticStatus (W.O. duplo termina com result null)
  const displayResult = optimisticStatus ? optimisticResult : result
  const displayIsDoubleWo = optimisticWo ? optimisticWo === 'double_wo' : isDoubleWo
  const displayIsWo = optimisticWo ? optimisticWo !== 'none' : isWo

  const router = useAppRouter()

  const isTempo   = counting === 'tempo'
  // 'set' (singular) é o valor persistido no banco; aceita também 'sets' para compatibilidade
  const isSets    = counting === 'set' || counting === 'sets'
  const isFinished = displayStatus === 'finalizado'
  const editable = canManage && !isFinished && !hasConflict

  const currentGameData = games.find((g) => g.game_number === currentGame) ?? {
    game_number: currentGame,
    score_a: 0,
    score_b: 0,
  }

  const winnerA = displayResult === 'lado_a'
  const winnerB = displayResult === 'lado_b'

  // Nº de sets necessários para vencer (MD3→2, MD5→3).
  const need = Math.floor(setsToPlay / 2) + 1
  const nameA = sideA.name ?? 'Lado A'
  const nameB = sideB.name ?? 'Lado B'

  // Um set está "decidido" quando alguém o venceu pelas regras da fase.
  function isSetDecided(g: { score_a: number; score_b: number }): boolean {
    const a = g.score_a, b = g.score_b
    if (winByTwo) {
      if (a >= pointsPerSet && a - b >= 2) return true
      if (b >= pointsPerSet && b - a >= 2) return true
    } else {
      if (a >= pointsPerSet && a > b) return true
      if (b >= pointsPerSet && b > a) return true
    }
    if (setDrawEnabled && a === b && a >= pointsPerSet) return true
    return false
  }

  // Conta sets vencidos por cada lado + soma total de pontos (para desempate).
  function tallySets(gs: GameScore[]): { sA: number; sB: number; pA: number; pB: number } {
    let sA = 0, sB = 0, pA = 0, pB = 0
    for (const g of gs) {
      pA += g.score_a; pB += g.score_b
      if (winByTwo) {
        if (g.score_a >= pointsPerSet && g.score_a - g.score_b >= 2) sA++
        else if (g.score_b >= pointsPerSet && g.score_b - g.score_a >= 2) sB++
      } else {
        if (g.score_a >= pointsPerSet && g.score_a > g.score_b) sA++
        else if (g.score_b >= pointsPerSet && g.score_b > g.score_a) sB++
      }
    }
    return { sA, sB, pA, pB }
  }

  // A partida finaliza AUTOMATICAMENTE quando o placar decide (mais sets vence;
  // empate só quando a fase permite e o resultado dá igual). Sem confirmação manual.

  // Volta para a lista. Navegação client-side primeiro; se não concluir (offline,
  // sinal fraco → o RSC fica pendurado) força navegação completa, que o service
  // worker atende com o shell offline. Partida encerrada NESTA sessão usa replace:
  // o "voltar" do aparelho não cai de novo na tela do placar já encerrado.
  const wasFinishedOnMountRef = useRef(initialStatus === 'finalizado')
  const goBack = useCallback(
    (replace: boolean) => {
      // Shell offline: troca só a URL, na hora (sem servidor nem recarga).
      if (shellNavigate(backHref, replace)) return
      const from = window.location.pathname
      if (replace) router.replace(backHref)
      else router.push(backHref)
      // Só força se a navegação não saiu desta tela — se o usuário já foi para
      // outro lugar (ex.: abriu o próximo jogo), não o puxa de volta.
      setTimeout(() => {
        if (window.location.pathname === from) window.location.assign(backHref)
      }, 1500)
    },
    [router, backHref],
  )

  // Volta sozinho 2 s após a partida finalizar nesta sessão (tempo p/ ver o resultado).
  // (Se já estava finalizada ao carregar, não redireciona.)
  useEffect(() => {
    if (isFinished && !wasFinishedOnMountRef.current) {
      const t = setTimeout(() => goBack(true), 2000)
      return () => clearTimeout(t)
    }
  }, [isFinished, goBack])

  // Cronômetro iniciado? (gate do placar no modo tempo — #9)
  const [timerStarted, setTimerStarted] = useState(false)

  // Excluir dados da partida (#5)
  const [clearing, setClearing] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)

  // Remonta o cronômetro depois de limpar/reabrir (ele guarda estado próprio).
  const [timerKey, setTimerKey] = useState(0)

  /** Depois de reabrir/limpar: a tela volta a seguir o motor (fila + servidor). */
  function resetLocalView() {
    setOptimisticStatus(null)
    setOptimisticResult(null)
    setOptimisticWo(null)
    setWoBusy(null)
    wasFinishedOnMountRef.current = false
    setTimerKey((k) => k + 1)
  }

  // Limpar e reabrir vão pela fila: funcionam offline, sem recarregar a página,
  // e chegam ao servidor depois do placar/encerramento que vieram antes.
  async function handleClear() {
    if (!canClear || clearing) return
    setClearing(true)
    setClearError(null)
    try {
      await clearMatch(matchId)
      try { localStorage.removeItem(`court-timer-${matchId}`) } catch { /* ignore */ }
      resetLocalView()
      setConfirmClear(false)
      await refresh()
    } catch {
      setClearError('Não foi possível excluir os dados da partida.')
    } finally {
      setClearing(false)
    }
  }

  const [reopening, setReopening] = useState(false)
  const [reopenError, setReopenError] = useState<string | null>(null)

  async function handleReopen() {
    if (!canReopen || reopening) return
    setReopening(true)
    setReopenError(null)
    try {
      await reopenMatch(matchId, isOrganizer)
      resetLocalView()
      await refresh()
    } catch {
      setReopenError('Não foi possível reabrir a partida.')
    } finally {
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
      if (!canSchedule) return
      setSavingDate(true)
      setScheduledLocal(iso)
      try {
        await setSchedule(matchId, iso) // fila: sobe quando houver rede
      } finally {
        setSavingDate(false)
      }
    },
    [canSchedule, matchId],
  )

  // Data já alterada neste aparelho e ainda na fila.
  useEffect(() => {
    let cancelled = false
    void getQueuedMatchState(matchId).then((q) => {
      if (!cancelled && q?.scheduledAt !== undefined) setScheduledLocal(q.scheduledAt ?? null)
    })
    return () => { cancelled = true }
  }, [matchId])

  function handleDateChange(value: string) {
    if (!value) { void saveSchedule(null); return }
    // Salva ao meio-dia local para evitar “voltar um dia” por fuso ao reexibir
    const iso = new Date(`${value}T12:00:00`).toISOString()
    void saveSchedule(iso)
  }

  // Define automaticamente a data de hoje ao iniciar o jogo, se ainda não houver.
  useEffect(() => {
    if (autoSetRef.current) return
    if (!canManage || !canSchedule) return
    if (scheduledLocal) return
    if (status === 'em_andamento' || status === 'finalizado') {
      autoSetRef.current = true
      const iso = new Date(new Date().setHours(12, 0, 0, 0)).toISOString()
      void saveSchedule(iso)
    }
  }, [status, canManage, canSchedule, scheduledLocal, saveSchedule])

  // ── Cronômetro (modo tempo) ────────────────────────────────────────────────
  // Pausar NÃO grava no servidor: resolve_match finaliza a partida assim que
  // duration_seconds está preenchido, então gravar na pausa fazia o próximo
  // ponto encerrar o jogo. O tempo pausado fica no localStorage (CourtTimer).
  //
  // Encerrar vai pela fila (funciona offline): grava a duração e o placar final,
  // nessa ordem, e o trigger finaliza a partida no servidor.
  const handleTimerStop = useCallback(
    async (seconds: number) => {
      const g = gamesRef.current.find((x) => x.game_number === 1) ?? { score_a: 0, score_b: 0 }
      await finishTimer(matchId, {
        seconds,
        score_a: g.score_a,
        score_b: g.score_b,
        drawAllowed: setDrawEnabled,
      })
      await refresh() // mostra o resultado na hora, mesmo offline
    },
    [matchId, setDrawEnabled, refresh],
  )

  // Rótulo da partida para a tela de sincronização (/sincronizacao).
  useEffect(() => {
    void setSyncMeta(matchId, {
      label: `${sideA.name ?? 'Lado A'} × ${sideB.name ?? 'Lado B'}`,
      href: typeof window !== 'undefined' ? window.location.pathname : backHref,
    })
  }, [matchId, sideA.name, sideB.name, backHref])

  // ── Encerrar partida ───────────────────────────────────────────────────────
  // Botão universal (sets e pontos). Se o placar já decide a partida pelas regras,
  // finaliza direto. Caso contrário, abre um modal para informar o que ocorreu
  // (desclassificação ou interrupção com placar parcial).
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [showFinishModal, setShowFinishModal] = useState(false)
  const [tieBreak, setTieBreak] = useState(false) // organizador escolhe (empate total)

  // Aplica o resultado escolhido. Garante que o placar parcial esteja salvo antes.
  // Organizer/admin → finalize_match_manual; participante → finalize_match_by_participant.
  // Sem rede a ação vai para a fila local e sincroniza ao reconectar.
  const applyFinish = useCallback(
    async (res: 'lado_a' | 'lado_b' | 'empate') => {
      if (finishing) return
      setFinishing(true)
      setFinishError(null)
      try {
        const out = await finalizeMatch(matchId, { kind: 'result', result: res, isOrganizer })
        if (out.error) {
          setFinishError(out.error)
          return
        }
        // Atualiza estado otimista: exibe vencedor imediatamente sem esperar realtime
        setOptimisticStatus('finalizado')
        setOptimisticResult(res)
        setOptimisticWo('none')
        setShowFinishModal(false)
        setTieBreak(false)
      } catch (e) {
        setFinishError(e instanceof Error ? e.message : 'Não foi possível encerrar a partida.')
      } finally {
        setFinishing(false)
      }
    },
    [matchId, finishing, isOrganizer],
  )

  // Clique em "Encerrar partida": decide se finaliza direto ou abre o modal.
  function handleFinishClick() {
    if (!editable) return
    setFinishError(null)
    setTieBreak(false)
    if (isSets) {
      const { sA, sB } = tallySets(gamesRef.current)
      if (sA >= need || sB >= need) {
        void applyFinish(sA >= need ? 'lado_a' : 'lado_b') // resultado válido
        return
      }
      setShowFinishModal(true) // incompleto
    } else {
      const g = gamesRef.current[0] ?? { score_a: 0, score_b: 0 }
      if (g.score_a !== g.score_b) {
        void applyFinish(g.score_a > g.score_b ? 'lado_a' : 'lado_b')
        return
      }
      setShowFinishModal(true) // empate em pontos → incompleto
    }
  }

  // Desclassificação: vence o outro lado e ANULA o placar parcial (o set que
  // ficou em quadra não deve aparecer como "1x0" na tabela de jogos). Conta como
  // vitória/derrota normal (≠ W.O.), por isso usa um RPC dedicado que apaga os
  // match_games. Organizer/admin → finalize_match_dq; participante → _by_participant.
  const applyDq = useCallback(
    async (winner: 'lado_a' | 'lado_b') => {
      if (finishing) return
      setFinishing(true)
      setFinishError(null)
      try {
        const out = await finalizeMatch(matchId, { kind: 'dq', result: winner, isOrganizer })
        if (out.error) {
          setFinishError(out.error)
          return
        }
        setOptimisticStatus('finalizado')
        setOptimisticResult(winner)
        setOptimisticWo('none')
        setShowFinishModal(false)
        setTieBreak(false)
        void refresh() // o placar parcial foi anulado
      } catch (e) {
        setFinishError(e instanceof Error ? e.message : 'Não foi possível desclassificar.')
      } finally {
        setFinishing(false)
      }
    },
    [matchId, finishing, isOrganizer, refresh],
  )

  // Desclassificação: vence automaticamente o outro lado, independente do placar.
  function handleDisqualify(side: 'a' | 'b') {
    void applyDq(side === 'a' ? 'lado_b' : 'lado_a')
  }

  // Interrompida com placar parcial: vence quem tem mais sets; empate em sets →
  // maior soma de pontos; persistindo empate → organizador escolhe.
  function handleInterrupted() {
    if (isSets) {
      const { sA, sB, pA, pB } = tallySets(gamesRef.current)
      if (sA > sB) return void applyFinish('lado_a')
      if (sB > sA) return void applyFinish('lado_b')
      if (pA > pB) return void applyFinish('lado_a')
      if (pB > pA) return void applyFinish('lado_b')
      setTieBreak(true)
    } else {
      const g = gamesRef.current[0] ?? { score_a: 0, score_b: 0 }
      if (g.score_a > g.score_b) return void applyFinish('lado_a')
      if (g.score_b > g.score_a) return void applyFinish('lado_b')
      setTieBreak(true)
    }
  }

  // Decreta WO: vencedor leva a vitória; a partida não conta pontos/sets nas estatísticas.
  // Organizer/admin → finalize_match_wo; participante → finalize_match_wo_by_participant.
  // W.O. duplo (os dois faltaram): sem vencedor e sem pontos para ninguém.
  const [woBusy, setWoBusy] = useState<'a' | 'b' | 'double' | null>(null)
  const [woError, setWoError] = useState<string | null>(null)
  const handleWO = useCallback(
    async (which: 'a' | 'b' | 'double') => {
      if (woBusy || !editable) return
      setWoBusy(which)
      setWoError(null)
      try {
        const winner = which === 'a' ? 'lado_a' : which === 'b' ? 'lado_b' : null
        const input: FinalizeInput =
          which === 'double'
            ? { kind: 'double_wo', isOrganizer }
            : { kind: 'wo', result: winner, isOrganizer }
        const out = await finalizeMatch(matchId, input)
        if (out.error) {
          setWoError(out.error)
          setWoBusy(null)
          return
        }
        setOptimisticStatus('finalizado')
        setOptimisticResult(winner)
        setOptimisticWo(which === 'double' ? 'double_wo' : 'wo')
        void refresh() // W.O. apaga o placar parcial
      } catch (e) {
        setWoError(e instanceof Error ? e.message : 'Não foi possível decretar o W.O.')
        setWoBusy(null)
      }
    },
    [matchId, woBusy, editable, isOrganizer, refresh],
  )

  return (
    <div className="px-5 py-4 space-y-4 max-w-md mx-auto">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between">
        <Link
          href={backHref}
          onClick={(e) => {
            e.preventDefault()
            goBack(isFinished && !wasFinishedOnMountRef.current)
          }}
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
      {canSchedule && canManage ? (
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
              key={timerKey}
              initialSeconds={initialDuration ?? 0}
              initialStopped={isFinished}
              storageKey={matchId}
              timeMinutes={timeMinutes}
              onStop={handleTimerStop}
              onStartedChange={setTimerStarted}
            />
          </div>

          {/* Placares para modo tempo — só habilita após iniciar o cronômetro (#9) */}
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
                disabled={!editable || !timerStarted}
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
                disabled={!editable || !timerStarted}
                isWinner={winnerB}
              />
            </div>
            {editable && !timerStarted && (
              <p className="mt-3 text-center text-[11px] text-white/35">
                Inicie o cronômetro para lançar o placar.
              </p>
            )}
          </div>

          {/* Excluir dados da partida (#5) — relançar do zero */}
          {canClear && canManage && (
            confirmClear ? (
              <div className="glass glass-card px-4 py-3 space-y-2.5">
                <p className="text-xs text-white/70">
                  Excluir o placar e o tempo desta partida? Ela volta ao estado inicial para ser refeita.
                </p>
                {clearError && <p className="text-[11px] text-red-400">{clearError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={clearing}
                    onClick={() => void handleClear()}
                    className="flex-1 rounded-xl bg-red-500/90 px-3 py-2 text-xs font-bold text-white transition active:scale-95 disabled:opacity-50"
                  >
                    {clearing ? 'Excluindo…' : 'Sim, excluir'}
                  </button>
                  <button
                    type="button"
                    disabled={clearing}
                    onClick={() => setConfirmClear(false)}
                    className="rounded-xl bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white/65 transition active:scale-95"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setClearError(null); setConfirmClear(true) }}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-3 text-xs font-semibold text-white/55 transition hover:bg-white/[0.08] hover:text-white/75 active:scale-95"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Excluir dados da partida
              </button>
            )
          )}
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

          {/* Avançar set
              Condições:
              1. Partida editável e modalidade de sets
              2. Ainda há sets a jogar (games.length < setsToPlay)
              3. Nenhum lado já atingiu os sets necessários para vencer
                 (ex.: MD3→2 sets; MD5→3 sets) — evita abrir set desnecessário
                 tanto online (race condition realtime) quanto offline. */}
          {(() => {
            if (!editable || !isSets || games.length === 0 || games.length >= setsToPlay) return null
            // Só permite avançar quando o set atual está DECIDIDO (alguém venceu).
            // Isso impede acumular sets incompletos e garante o término antecipado:
            // ao fechar o set decisivo (MD3→2º, MD5→3º) a partida finaliza sozinha.
            if (!isSetDecided(currentGameData)) return null
            const { sA, sB } = tallySets(games)
            if (sA >= need || sB >= need) return null  // partida já decidida
            return (
              <button
                type="button"
                onClick={() => void advanceGame()}
                className="w-full glass glass-card py-3 text-xs font-semibold text-white/40 hover:text-white/70 transition text-center rounded-2xl"
              >
                ↓ Encerrar set e avançar
              </button>
            )
          })()}
        </div>
      )}

      {/* ── Encerrar partida (sets e pontos; tempo encerra pelo cronômetro) ── */}
      {editable && !isTempo && (
        <div className="space-y-1.5">
          <button
            type="button"
            disabled={finishing}
            onClick={handleFinishClick}
            className="w-full flex items-center justify-center gap-2 glass glass-card py-3 text-xs font-semibold text-red-400/80 hover:text-red-400 transition active:scale-95 disabled:opacity-40"
          >
            {finishing ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400/20 border-t-red-400/60" />
            ) : (
              <Square className="h-3.5 w-3.5 fill-current" />
            )}
            Encerrar partida
          </button>
          {finishError && !showFinishModal && (
            <p className="text-[11px] text-red-400/80 text-center">{finishError}</p>
          )}
        </div>
      )}

      {/* ── W.O. (qualquer participante editável pode decretar) ── */}
      {editable && (
        <div className="glass glass-card px-4 py-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30 text-center">
            W.O. — o adversário não compareceu
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!!woBusy}
              onClick={() => void handleWO('a')}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-white/[0.05] py-2.5 text-xs font-semibold text-white/60 hover:bg-secondary/15 hover:text-secondary transition active:scale-95 disabled:opacity-40"
            >
              <Flag className="h-3.5 w-3.5" />
              {sideA.name ?? 'Lado A'} vence
            </button>
            <button
              type="button"
              disabled={!!woBusy}
              onClick={() => void handleWO('b')}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-white/[0.05] py-2.5 text-xs font-semibold text-white/60 hover:bg-secondary/15 hover:text-secondary transition active:scale-95 disabled:opacity-40"
            >
              <Flag className="h-3.5 w-3.5" />
              {sideB.name ?? 'Lado B'} vence
            </button>
          </div>
          {allowDoubleWo && (
            <button
              type="button"
              disabled={!!woBusy}
              onClick={() => void handleWO('double')}
              className="w-full flex items-center justify-center gap-1.5 rounded-2xl bg-amber-500/10 py-2.5 text-xs font-semibold text-amber-300/80 hover:bg-amber-500/20 hover:text-amber-300 transition active:scale-95 disabled:opacity-40"
            >
              <UserX className="h-3.5 w-3.5" />
              W.O. duplo — nenhum dos dois compareceu
            </button>
          )}
          {allowDoubleWo && (
            <p className="text-[10px] text-white/30 text-center leading-snug">
              No W.O. duplo ninguém pontua: a partida não conta vitória, derrota, sets nem pontos.
            </p>
          )}
          {woError && <p className="text-[11px] text-red-400/80 text-center">{woError}</p>}
        </div>
      )}

      {/* ── Resultado final ── */}
      {isFinished && (
        <div className="glass glass-card px-4 py-4 text-center space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Resultado final
          </p>
          {displayIsDoubleWo ? (
            <>
              <p className="text-base font-black text-amber-300">W.O. duplo</p>
              <p className="text-xs text-white/45">Nenhum dos dois compareceu — a partida não pontua.</p>
            </>
          ) : (
            <p className="text-base font-black text-secondary">
              {displayResult === 'empate'
                ? 'Empate'
                : displayResult === 'lado_a'
                  ? (sideA.name ?? 'Lado A')
                  : (sideB.name ?? 'Lado B')} venceu{displayIsWo ? ' por W.O.' : ''}
            </p>
          )}
        </div>
      )}

      {/* ── Reabrir partida (só para organizadores/admins) ── */}
      {isFinished && canReopen && (
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

      {/* ── Modal: partida incompleta ── */}
      {showFinishModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-5"
          onClick={() => { if (!finishing) { setShowFinishModal(false); setTieBreak(false) } }}
        >
          <div
            className="glass glass-card glass-overlay w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {!tieBreak ? (
              <>
                <div className="text-center space-y-1.5">
                  <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-amber-500/15">
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                  </div>
                  <p className="text-sm font-bold text-white">Partida incompleta</p>
                  <p className="text-xs leading-relaxed text-white/50">
                    O placar atual não decide a partida pelas regras. Informe o que aconteceu.
                  </p>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={finishing}
                    onClick={() => handleDisqualify('a')}
                    className="w-full rounded-2xl bg-white/[0.05] px-4 py-3 text-left transition hover:bg-white/[0.09] active:scale-[0.98] disabled:opacity-40"
                  >
                    <span className="block text-sm font-semibold text-white">{nameA} foi desclassificado</span>
                    <span className="block text-[11px] text-white/45">{nameB} vence a partida</span>
                  </button>
                  <button
                    type="button"
                    disabled={finishing}
                    onClick={() => handleDisqualify('b')}
                    className="w-full rounded-2xl bg-white/[0.05] px-4 py-3 text-left transition hover:bg-white/[0.09] active:scale-[0.98] disabled:opacity-40"
                  >
                    <span className="block text-sm font-semibold text-white">{nameB} foi desclassificado</span>
                    <span className="block text-[11px] text-white/45">{nameA} vence a partida</span>
                  </button>
                  <button
                    type="button"
                    disabled={finishing}
                    onClick={handleInterrupted}
                    className="w-full rounded-2xl bg-secondary/12 px-4 py-3 text-left transition hover:bg-secondary/20 active:scale-[0.98] disabled:opacity-40"
                  >
                    <span className="block text-sm font-semibold text-secondary">Partida interrompida</span>
                    <span className="block text-[11px] text-secondary/60">
                      Vence quem tem mais {isSets ? 'sets (empate → mais pontos)' : 'pontos'}
                    </span>
                  </button>
                  {/* Empate só quando a fase permite empate */}
                  {setDrawEnabled && (
                    <button
                      type="button"
                      disabled={finishing}
                      onClick={() => void applyFinish('empate')}
                      className="w-full rounded-2xl bg-white/[0.05] px-4 py-3 text-left transition hover:bg-white/[0.09] active:scale-[0.98] disabled:opacity-40"
                    >
                      <span className="block text-sm font-semibold text-white">Empate</span>
                      <span className="block text-[11px] text-white/45">A partida termina empatada</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="text-center space-y-1.5">
                  <p className="text-sm font-bold text-white">Empate técnico</p>
                  <p className="text-xs leading-relaxed text-white/50">
                    {isSets ? 'Sets e pontos empatados.' : 'Pontos empatados.'}{' '}
                    {setDrawEnabled
                      ? 'Registre como empate ou escolha o vencedor.'
                      : 'Como organizador, escolha o vencedor.'}
                  </p>
                </div>
                {setDrawEnabled && (
                  <button
                    type="button"
                    disabled={finishing}
                    onClick={() => void applyFinish('empate')}
                    className="w-full rounded-2xl bg-white/[0.06] px-3 py-2.5 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-40"
                  >
                    Registrar empate
                  </button>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={finishing}
                    onClick={() => void applyFinish('lado_a')}
                    className="flex-1 rounded-2xl bg-secondary/15 px-3 py-2.5 text-xs font-semibold text-secondary transition active:scale-95 disabled:opacity-40"
                  >
                    {nameA} vence
                  </button>
                  <button
                    type="button"
                    disabled={finishing}
                    onClick={() => void applyFinish('lado_b')}
                    className="flex-1 rounded-2xl bg-secondary/15 px-3 py-2.5 text-xs font-semibold text-secondary transition active:scale-95 disabled:opacity-40"
                  >
                    {nameB} vence
                  </button>
                </div>
              </>
            )}

            {finishError && (
              <p className="text-[11px] text-red-400/80 text-center">{finishError}</p>
            )}

            <button
              type="button"
              disabled={finishing}
              onClick={() => { setShowFinishModal(false); setTieBreak(false) }}
              className="w-full rounded-2xl bg-white/[0.04] py-2.5 text-xs font-semibold text-white/55 transition hover:bg-white/[0.08] active:scale-95 disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
