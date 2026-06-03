'use client'

/**
 * CourtTimer — cronômetro para jogos por tempo.
 *
 * Persistência (#7): o estado é gravado em localStorage por partida com um
 * relógio de parede (startedAt). Se o usuário fecha ou volta à página com o
 * cronômetro rodando, ele CONTINUA contando — o tempo decorrido é recalculado
 * a partir de `startedAt`, em vez de zerar.
 *
 * Props:
 *   initialSeconds   — segundos já acumulados no servidor (duration_seconds)
 *   storageKey       — chave única por partida (ex.: matchId)
 *   timeMinutes      — tempo estipulado; dispara o alerta de tempo esgotado (#8)
 *   onTick(s)        — total acumulado a cada segundo (p/ salvar no servidor)
 *   onPause(s)       — ao pausar, total acumulado
 *   onStop(s)        — ao encerrar, total acumulado
 *   onStartedChange  — informa quando o cronômetro foi iniciado (gate do placar #9)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, Square, AlarmClock } from 'lucide-react'

export type CourtTimerProps = {
  initialSeconds?: number
  initialStopped?: boolean
  storageKey?: string
  timeMinutes?: number | null
  onTick?: (seconds: number) => void
  onPause?: (seconds: number) => void
  onStop: (seconds: number) => void
  onStartedChange?: (started: boolean) => void
}

type Persisted = { base: number; startedAt: number | null; stopped: boolean }

function formatTime(s: number): string {
  const neg = s < 0
  const abs = Math.abs(s)
  const m = Math.floor(abs / 60)
  const sec = abs % 60
  return `${neg ? '-' : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function CourtTimer({
  initialSeconds = 0,
  initialStopped = false,
  storageKey,
  timeMinutes,
  onTick,
  onPause,
  onStop,
  onStartedChange,
}: CourtTimerProps) {
  const lsKey = storageKey ? `court-timer-${storageKey}` : null

  // Estado base persistido. Carrega do localStorage (estado mais recente neste
  // dispositivo) e cai para o valor do servidor quando não há nada salvo.
  const [base, setBase] = useState(initialSeconds)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [stopped, setStopped] = useState(initialStopped)
  // `now` força o recálculo do display a cada segundo enquanto roda.
  const [now, setNow] = useState(() => Date.now())
  const hydratedRef = useRef(false)
  const overNotifiedRef = useRef(false)

  // ── Hidratação inicial (uma vez) ───────────────────────────────────────────
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    if (!lsKey || initialStopped) {
      setBase(initialSeconds)
      setStopped(initialStopped)
      return
    }
    try {
      const raw = localStorage.getItem(lsKey)
      if (raw) {
        const p = JSON.parse(raw) as Persisted
        // usa o maior entre servidor e localStorage como base mínima
        setBase(Math.max(p.base ?? 0, initialSeconds))
        setStartedAt(p.startedAt ?? null)
        setStopped(p.stopped ?? false)
        return
      }
    } catch {
      /* ignore */
    }
    setBase(initialSeconds)
  }, [lsKey, initialSeconds, initialStopped])

  const persist = useCallback(
    (next: Persisted) => {
      if (!lsKey) return
      try {
        if (next.stopped) localStorage.removeItem(lsKey)
        else localStorage.setItem(lsKey, JSON.stringify(next))
      } catch {
        /* ignore */
      }
    },
    [lsKey],
  )

  const running = startedAt !== null && !stopped
  const seconds = base + (startedAt !== null ? Math.floor((now - startedAt) / 1000) : 0)
  const secondsRef = useRef(seconds)
  useEffect(() => { secondsRef.current = seconds }, [seconds])

  // Informa o "iniciado" para o gate do placar (#9): rodando ou já tem tempo.
  useEffect(() => {
    onStartedChange?.(running || seconds > 0 || stopped)
  }, [running, seconds, stopped, onStartedChange])

  // ── Tick: re-renderiza a cada segundo enquanto roda + onTick p/ salvar ──────
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setNow(Date.now())
      onTick?.(secondsRef.current)
    }, 1000)
    return () => clearInterval(id)
  }, [running, onTick])

  // ── Alerta de tempo esgotado (#8): vibra uma vez ao ultrapassar ─────────────
  const limit = timeMinutes && timeMinutes > 0 ? timeMinutes * 60 : null
  const overtime = limit !== null && seconds >= limit && !stopped
  useEffect(() => {
    if (overtime && !overNotifiedRef.current) {
      overNotifiedRef.current = true
      try {
        navigator.vibrate?.([180, 80, 180])
      } catch {
        /* ignore */
      }
    }
    if (!overtime) overNotifiedRef.current = false
  }, [overtime])

  // ── Controles ───────────────────────────────────────────────────────────────
  const handleStart = () => {
    if (stopped) return
    const at = Date.now()
    setStartedAt(at)
    setNow(at)
    persist({ base, startedAt: at, stopped: false })
    onStartedChange?.(true)
  }

  const handlePause = () => {
    const acc = base + (startedAt !== null ? Math.floor((Date.now() - startedAt) / 1000) : 0)
    setBase(acc)
    setStartedAt(null)
    persist({ base: acc, startedAt: null, stopped: false })
    onPause?.(acc)
  }

  const handleStop = () => {
    const acc = base + (startedAt !== null ? Math.floor((Date.now() - startedAt) / 1000) : 0)
    setBase(acc)
    setStartedAt(null)
    setStopped(true)
    persist({ base: acc, startedAt: null, stopped: true })
    onStop(acc)
  }

  const ringClass = stopped
    ? 'ring-white/10'
    : overtime
      ? 'ring-red-500/70 shadow-[0_0_32px_rgba(239,68,68,0.25)]'
      : running
        ? 'ring-secondary/60 shadow-[0_0_32px_rgba(205,253,81,0.25)]'
        : 'ring-white/15'

  const numColor = stopped
    ? 'text-white/30'
    : overtime
      ? 'text-red-400'
      : running
        ? 'text-secondary'
        : 'text-white/70'

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Display MM:SS */}
      <div className="relative">
        <div
          className={['h-36 w-36 rounded-full grid place-items-center ring-4 transition-all duration-500', ringClass].join(' ')}
          style={{
            background: overtime
              ? 'radial-gradient(circle, rgba(239,68,68,0.07) 0%, transparent 70%)'
              : running
                ? 'radial-gradient(circle, rgba(205,253,81,0.06) 0%, transparent 70%)'
                : 'transparent',
          }}
        >
          <span className={['font-black tabular-nums tracking-tight transition-colors duration-300 text-4xl', numColor].join(' ')}>
            {formatTime(seconds)}
          </span>
        </div>
        {running && !overtime && (
          <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-secondary animate-pulse" />
        )}
        {overtime && (
          <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
        )}
      </div>

      {/* Alerta de tempo esgotado (#8) */}
      {overtime && (
        <div className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1.5 ring-1 ring-red-500/30">
          <AlarmClock className="h-3.5 w-3.5 text-red-400" />
          <span className="text-[11px] font-semibold text-red-400">
            Tempo esgotado{limit ? ` · ${timeMinutes} min` : ''} — encerre a partida
          </span>
        </div>
      )}

      {/* Controles */}
      {!stopped ? (
        <div className="flex items-center gap-3">
          {!running ? (
            <button
              type="button"
              onClick={handleStart}
              className="flex items-center gap-2 rounded-full bg-secondary px-5 py-2.5 text-sm font-bold text-primary transition active:scale-95"
            >
              <Play className="h-4 w-4 fill-current" />
              {seconds === 0 ? 'Iniciar' : 'Retomar'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePause}
              className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white/80 transition active:scale-95"
            >
              <Pause className="h-4 w-4 fill-current" />
              Pausar
            </button>
          )}

          {seconds > 0 && (
            <button
              type="button"
              onClick={handleStop}
              className="flex items-center gap-2 rounded-full bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-400 transition active:scale-95"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              Encerrar
            </button>
          )}
        </div>
      ) : (
        <div className="glass glass-card px-5 py-3 text-center">
          <p className="text-xs font-semibold text-white/50">
            Tempo registrado: <span className="text-secondary font-bold">{formatTime(seconds)}</span>
          </p>
          <p className="text-[10px] text-white/25 mt-0.5">Duração salva no jogo</p>
        </div>
      )}
    </div>
  )
}
