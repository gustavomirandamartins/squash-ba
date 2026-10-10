'use client'

/**
 * Menu "⋯" de moderação: Denunciar (abre o formulário) e Bloquear o autor.
 * Usado no post, no comentário, no cabeçalho do chat e na ficha do jogador.
 * O bloqueio vale nos dois sentidos e é aplicado pelo banco; aqui só avisamos
 * o pai (onBlocked) para tirar o conteúdo da tela.
 */

import { useEffect, useRef, useState } from 'react'
import { Ban, Flag, Loader2, MoreHorizontal } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { blockUser, type ReportTarget } from '@/lib/moderation'
import { ReportDialog } from './ReportDialog'

export function ModerationMenu({
  meId,
  targetType,
  targetId,
  ownerId,
  ownerName,
  onBlocked,
  size = 'md',
}: {
  meId: string
  targetType: ReportTarget
  targetId: string
  ownerId: string
  ownerName: string | null
  onBlocked?: () => void
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao tocar fora.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false)
        setConfirmBlock(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  if (ownerId === meId) return null
  const who = ownerName?.trim().split(/\s+/)[0] || 'este usuário'

  async function block() {
    setBusy(true)
    setError(null)
    const { error } = await blockUser(createClient(), meId, ownerId)
    setBusy(false)
    if (error) {
      setError('Não foi possível bloquear. Tente de novo.')
      return
    }
    setOpen(false)
    setConfirmBlock(false)
    onBlocked?.()
  }

  const btn = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setConfirmBlock(false); setError(null) }}
        className={`grid ${btn} place-items-center rounded-full text-white/35 transition hover:bg-white/[0.06] hover:text-white/70`}
        aria-label="Mais opções"
        aria-expanded={open}
      >
        <MoreHorizontal className={icon} />
      </button>

      {open && (
        <div className="glass glass-overlay absolute right-0 top-full z-40 mt-1 w-60 overflow-hidden rounded-2xl border border-white/10 py-1 shadow-xl">
          {!confirmBlock ? (
            <>
              <button
                type="button"
                onClick={() => { setOpen(false); setReporting(true) }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-white/80 transition hover:bg-white/[0.06]"
              >
                <Flag className="h-4 w-4 text-yellow-400/80" />
                Denunciar
              </button>
              <button
                type="button"
                onClick={() => setConfirmBlock(true)}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red-400 transition hover:bg-white/[0.06]"
              >
                <Ban className="h-4 w-4" />
                Bloquear {who}
              </button>
            </>
          ) : (
            <div className="space-y-2.5 px-4 py-3">
              <p className="text-xs leading-relaxed text-white/65">
                Bloquear {who}? Vocês deixam de ver os posts e comentários um do outro e não
                trocam mais mensagens diretas. Dá para desbloquear no seu perfil.
              </p>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void block()}
                  className="flex flex-1 items-center justify-center rounded-full bg-red-500/15 py-1.5 text-xs font-bold text-red-400 transition active:scale-95 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Bloquear'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmBlock(false)}
                  className="flex-1 rounded-full bg-white/8 py-1.5 text-xs font-semibold text-white/60 transition active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {reporting && (
        <ReportDialog
          meId={meId}
          targetType={targetType}
          targetId={targetId}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  )
}
