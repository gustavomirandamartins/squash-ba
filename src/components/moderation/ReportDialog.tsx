'use client'

/** Formulário de denúncia: motivo + detalhes opcionais. */

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Flag, Loader2, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { REPORT_REASONS, TARGET_LABEL, reportContent, type ReportReason, type ReportTarget } from '@/lib/moderation'

const MAX_DETAILS = 1000

export function ReportDialog({
  meId,
  targetType,
  targetId,
  onClose,
}: {
  meId: string
  targetType: ReportTarget
  targetId: string
  onClose: () => void
}) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function send() {
    if (!reason || busy) return
    setBusy(true)
    setError(null)
    const { error } = await reportContent(createClient(), meId, targetType, targetId, reason, details)
    setBusy(false)
    if (error) setError(error)
    else setSent(true)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Denunciar"
    >
      <div
        className="glass glass-card w-full max-w-sm space-y-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-yellow-400/80" />
          <h2 className="flex-1 font-display text-base font-bold text-white">
            Denunciar {TARGET_LABEL[targetType].toLowerCase()}
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-white/40 hover:text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-secondary" />
            <p className="text-sm leading-relaxed text-white/70">
              Denúncia enviada. A equipe do SquashBa vai analisar e, se for o caso, remover o
              conteúdo.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl bg-secondary py-2.5 text-sm font-bold text-primary transition active:scale-95"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    reason === r.value ? 'bg-secondary/15 text-white' : 'bg-white/[0.04] text-white/70'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-[#cdfd51]"
                  />
                  {r.label}
                </label>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={MAX_DETAILS}
              rows={3}
              placeholder="Detalhes (opcional)"
              className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-secondary/50"
            />
            {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
            <button
              type="button"
              disabled={!reason || busy}
              onClick={() => void send()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-2.5 text-sm font-bold text-primary transition active:scale-95 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar denúncia'}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
