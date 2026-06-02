'use client'

/**
 * CourtTimer — cronômetro para jogos por tempo.
 *
 * Props:
 *   initialSeconds  — segundos já acumulados (p/ retomar um jogo iniciado)
 *   onTick(s)       — chamado a cada segundo com total acumulado
 *   onStop(s)       — chamado ao encerrar com total acumulado
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, Square } from 'lucide-react'

export type CourtTimerProps = {
  initialSeconds?: number
  /** Inicia já no estado "encerrado" (partida já finalizada ao carregar) */
  initialStopped?: boolean
  onTick?: (seconds: number) => void
  /** Chamado ao pausar com total acumulado (permite salvar progresso) */
  onPause?: (seconds: number) => void
  onStop: (seconds: number) => void
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function CourtTimer({ initialSeconds = 0, initialStopped = false, onTick, onPause, onStop }: CourtTimerProps) {
  const [seconds, setSeconds] = useState(initialSeconds)
  const [running, setRunning] = useState(false)
  const [stopped, setStopped] = useState(initialStopped)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const secondsRef = useRef(initialSeconds)

  // Sincroniza ref para acessar no callback sem closure stale
  useEffect(() => {
    secondsRef.current = seconds
  }, [seconds])

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setSeconds((prev) => {
        const next = prev + 1
        secondsRef.current = next
        onTick?.(next)
        return next
      })
    }, 1000)
  }, [onTick])

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => () => stopInterval(), [stopInterval])

  const handleStart = () => {
    if (stopped) return
    setRunning(true)
    startInterval()
  }

  const handlePause = () => {
    setRunning(false)
    stopInterval()
    onPause?.(secondsRef.current)
  }

  const handleStop = () => {
    stopInterval()
    setRunning(false)
    setStopped(true)
    onStop(secondsRef.current)
  }

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Display MM:SS */}
      <div className="relative">
        {/* Anel de progresso visual */}
        <div
          className={[
            'h-36 w-36 rounded-full grid place-items-center',
            'ring-4 transition-all duration-500',
            running
              ? 'ring-secondary/60 shadow-[0_0_32px_rgba(205,253,81,0.25)]'
              : stopped
                ? 'ring-white/10'
                : 'ring-white/15',
          ].join(' ')}
          style={{
            background: running
              ? 'radial-gradient(circle, rgba(205,253,81,0.06) 0%, transparent 70%)'
              : 'transparent',
          }}
        >
          <span
            className={[
              'font-black tabular-nums tracking-tight transition-colors duration-300',
              'text-4xl',
              running ? 'text-secondary' : stopped ? 'text-white/30' : 'text-white/70',
            ].join(' ')}
          >
            {formatTime(seconds)}
          </span>
        </div>

        {/* Live indicator */}
        {running && (
          <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-secondary animate-pulse" />
        )}
      </div>

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
