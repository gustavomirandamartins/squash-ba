'use client'

/**
 * Ações de uma mensagem recebida: "Denunciar mensagem".
 * Celular: toque longo na bolha. Computador: botão "⋯" ao passar o mouse
 * (ou clique direito).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Flag, MoreHorizontal } from 'lucide-react'
import { ReportDialog } from '@/components/moderation/ReportDialog'

const LONG_PRESS_MS = 500

export function ReceivedMessageMenu({
  meId,
  messageId,
  children,
}: {
  meId: string
  messageId: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Fecha ao tocar fora.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  useEffect(() => () => clearTimeout(timer.current), [])

  const cancelPress = () => clearTimeout(timer.current)

  return (
    <div ref={ref} className="group relative flex items-center gap-1">
      <div
        className="min-w-0 select-none [-webkit-touch-callout:none]"
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') return
          cancelPress()
          timer.current = setTimeout(() => setOpen(true), LONG_PRESS_MS)
        }}
        onPointerUp={cancelPress}
        onPointerMove={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => {
          // Toque longo (Android dispara contextmenu) ou clique direito: o
          // nosso menu, não o do sistema.
          e.preventDefault()
          cancelPress()
          setOpen(true)
        }}
      >
        {children}
      </div>

      {/* Computador: aparece ao passar o mouse (oculto em telas de toque). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ações da mensagem"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/35 opacity-0 transition hover:bg-white/[0.06] hover:text-white/70 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:hidden"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="glass glass-overlay absolute left-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-2xl border border-white/10 py-1 shadow-xl">
          <button
            type="button"
            onClick={() => { setOpen(false); setReporting(true) }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white/80 transition hover:bg-white/[0.06]"
          >
            <Flag className="h-4 w-4 text-yellow-400/80" />
            Denunciar mensagem
          </button>
        </div>
      )}

      {reporting && (
        <ReportDialog meId={meId} targetType="message" targetId={messageId} onClose={() => setReporting(false)} />
      )}
    </div>
  )
}
