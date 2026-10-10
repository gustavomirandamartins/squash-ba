'use client'

/**
 * "Voltar" das páginas públicas (/termos, /privacidade): volta à página
 * anterior; sem histórico (aberta direto ou em aba nova, como o link dos
 * termos no cadastro), vai para o início.
 */

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export function BackLink({ className = '' }: { className?: string }) {
  const router = useRouter()

  function goBack() {
    if (window.history.length > 1) router.back()
    else router.push('/')
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className={`flex items-center gap-1.5 text-sm text-white/55 transition hover:text-white/85 ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
      Voltar
    </button>
  )
}
