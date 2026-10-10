'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { acceptTerms } from './actions'

export function AcceptForm() {
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-3 text-sm text-white/75">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#cdfd51]"
        />
        Li e aceito os Termos de Uso do SquashBa.
      </label>
      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
      <button
        type="button"
        disabled={!checked || pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const r = await acceptTerms()
            if (r?.error) setError(r.error)
          })
        }
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-3.5 font-display text-sm font-bold text-primary transition active:scale-95 disabled:opacity-40"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Aceitar e continuar
      </button>
    </div>
  )
}
