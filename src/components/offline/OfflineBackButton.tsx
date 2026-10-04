'use client'

import { ChevronLeft } from 'lucide-react'

/**
 * Botão "Voltar" para as telas de aviso offline (sem navegação própria).
 * Usa o histórico do navegador — não depende do roteador do Next, que não
 * consegue buscar RSC sem rede — e cai em `fallbackHref` se não houver histórico
 * (ex.: o app foi aberto direto nesta tela).
 */
export function OfflineBackButton({
  fallbackHref = '/',
  className = '',
}: {
  fallbackHref?: string
  className?: string
}) {
  function goBack() {
    if (window.history.length > 1) window.history.back()
    else window.location.assign(fallbackHref)
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-white/12 px-5 py-2.5 text-sm font-semibold text-white/70 transition hover:text-white active:scale-[0.98] ${className}`}
    >
      <ChevronLeft className="h-4 w-4" />
      Voltar
    </button>
  )
}
