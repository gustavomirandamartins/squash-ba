'use client'

import { useActionState } from 'react'
import { createAd, type AdResult } from './actions'
import { Plus, CheckCircle2, AlertCircle } from 'lucide-react'

export function AdForm() {
  const [state, action, pending] = useActionState<AdResult | null, FormData>(createAd, null)

  return (
    <div className="glass glass-card px-4 py-4 space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
        Novo anúncio
      </p>

      {state && 'ok' in state && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Anúncio criado com sucesso!
        </div>
      )}
      {state && 'error' in state && (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <form action={action} className="space-y-3">
        <Field name="name" label="Nome / Empresa *" placeholder="Ex.: Academia Squash Bahia" />
        <Field name="product_service" label="Produto / Serviço *" placeholder="Ex.: Aulas de squash, raquetes, cordas…" />
        <Field name="phone" label="Telefone" placeholder="(71) 9 9999-9999" />
        <Field name="email" label="E-mail" placeholder="contato@exemplo.com" type="email" />
        <Field name="address" label="Endereço" placeholder="Rua, número, bairro, cidade" />

        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-secondary py-3 text-sm font-bold text-primary transition active:scale-[0.98] disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          {pending ? 'Salvando…' : 'Adicionar anúncio'}
        </button>
      </form>
    </div>
  )
}

function Field({
  name, label, placeholder, type = 'text',
}: {
  name: string; label: string; placeholder: string; type?: string
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-white/50">{label}</label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        className="w-full rounded-xl bg-white/6 px-3.5 py-2.5 text-sm text-white placeholder-white/25 outline-none ring-1 ring-white/10 transition focus:ring-secondary/40"
      />
    </div>
  )
}
