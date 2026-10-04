'use client'

/**
 * UpdateBanner — detecta quando um novo Service Worker ativa (nova versão do app)
 * e mostra um banner pedindo ao usuário para recarregar.
 *
 * Por que é necessário:
 *   O SW usa `skipWaiting: true` + `clientsClaim: true`, então o novo SW ativa
 *   imediatamente. Mas o JS antigo ainda está em memória — a próxima navegação
 *   client-side vai buscar RSC payloads novos para hidratar com JS velho, o que
 *   causa erro de mismatch. O reload carrega o JS novo do cache já atualizado.
 *
 * Detecção:
 *   `navigator.serviceWorker.controllerchange` dispara sempre que o SW ativo
 *   muda. Filtramos o caso inicial (sem controller na montagem) para não mostrar
 *   o banner na primeira instalação do PWA.
 */

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

export function UpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Se não há controller atual, este é o primeiro SW → não é uma atualização.
    const hadControllerOnMount = !!navigator.serviceWorker.controller

    const handleControllerChange = () => {
      // Só mostra o banner se havia um SW antes (= é uma atualização, não a instalação inicial).
      if (hadControllerOnMount) {
        setShowUpdate(true)
      }
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  if (!showUpdate) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,var(--top-inset))] z-[70] flex justify-center px-4"
      style={{ animation: 'reveal-up 0.35s ease-out' }}
    >
      <div className="glass glass-overlay glass-pill pointer-events-auto flex items-center gap-3 px-4 py-2.5 shadow-lg">
        <RefreshCw className="h-4 w-4 shrink-0 text-secondary" />
        <span className="text-xs font-semibold text-white/85">
          Nova versão disponível
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-secondary px-3 py-1 text-[11px] font-bold text-primary transition active:scale-95"
        >
          Atualizar
        </button>
      </div>
    </div>
  )
}
