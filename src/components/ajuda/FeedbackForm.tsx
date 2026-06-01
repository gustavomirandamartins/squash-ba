'use client'

import { useActionState } from 'react'
import { submitFeedback, type FeedbackResult } from '@/app/(app)/ajuda/actions'
import { Send, CheckCircle2, AlertCircle } from 'lucide-react'

const TYPES = [
  { value: 'bug',      label: '🐛 Bug' },
  { value: 'sugestao', label: '💡 Sugestão' },
  { value: 'critica',  label: '⚠️ Crítica' },
  { value: 'geral',    label: '💬 Geral' },
]

export function FeedbackForm() {
  const [state, action, pending] = useActionState<FeedbackResult | null, FormData>(
    submitFeedback,
    null,
  )

  if (state && 'ok' in state) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
        <p className="font-semibold text-white/80">Feedback enviado!</p>
        <p className="text-sm text-white/40">Obrigado. Vamos analisar em breve.</p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-3">
      {/* Tipo */}
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <label key={t.value} className="cursor-pointer">
            <input type="radio" name="type" value={t.value} defaultChecked={t.value === 'geral'} className="peer sr-only" />
            <span className="inline-flex items-center rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/50 transition peer-checked:border-secondary/40 peer-checked:bg-secondary/12 peer-checked:text-secondary">
              {t.label}
            </span>
          </label>
        ))}
      </div>

      {/* Mensagem */}
      <textarea
        name="message"
        rows={4}
        placeholder="Descreva o bug, sugestão ou crítica…"
        maxLength={1000}
        required
        className="w-full resize-none rounded-2xl bg-white/6 px-4 py-3 text-sm text-white placeholder-white/25 outline-none ring-1 ring-white/10 transition focus:ring-secondary/40"
      />

      {/* Erro */}
      {state && 'error' in state && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-secondary py-3 text-sm font-bold text-primary transition active:scale-[0.98] disabled:opacity-40"
      >
        <Send className="h-4 w-4" />
        {pending ? 'Enviando…' : 'Enviar feedback'}
      </button>
    </form>
  )
}
