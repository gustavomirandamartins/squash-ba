'use client'

/**
 * Error boundary das rotas autenticadas (app). Captura exceções lançadas em
 * Server/Client Components — ex.: falha de rede com o Supabase — e oferece
 * "Tentar de novo" (reset) em vez de uma tela branca. Mantém TopBar/BottomNav,
 * pois é renderizado dentro do layout.
 */

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Telemetria mínima — substituível por Sentry/PostHog futuramente.
    console.error('[app-error]', error)
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="glass glass-card reveal flex max-w-sm flex-col items-center gap-4 px-6 py-8">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-red-500/12 ring-1 ring-red-500/25">
          <AlertTriangle className="h-7 w-7 text-red-400" />
        </div>
        <div className="space-y-1.5">
          <h1 className="font-display text-lg font-extrabold text-white">
            Algo deu errado
          </h1>
          <p className="text-sm text-white/50">
            Não foi possível carregar esta tela. Verifique sua conexão e tente
            novamente.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={reset}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-secondary py-3 text-sm font-bold text-primary transition active:scale-[0.98]"
          >
            <RotateCcw className="h-4 w-4" />
            Tentar de novo
          </button>
          <Link
            href="/"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-white/12 py-3 text-sm font-semibold text-white/60 transition hover:text-white/90 active:scale-[0.98]"
          >
            <Home className="h-4 w-4" />
            Ir para o início
          </Link>
        </div>
        {error.digest && (
          <p className="pt-1 text-[10px] font-medium text-white/20">
            ref: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
