'use client'

import { useTransition, useActionState, useState, useEffect } from 'react'
import { Phone, Mail, MapPin, Trash2, Eye, EyeOff, ShoppingBag, Pencil, X, Check, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toggleAd, deleteAd, updateAd, type AdResult } from './actions'
import type { AdRow } from './page'

export function AdList({ ads }: { ads: AdRow[] }) {
  if (ads.length === 0) {
    return (
      <div className="glass glass-card px-4 py-10 text-center text-sm text-white/30">
        Nenhum anúncio cadastrado ainda.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 px-1">
        Anúncios cadastrados ({ads.length})
      </p>
      {ads.map((ad) => <AdCard key={ad.id} ad={ad} />)}
    </div>
  )
}

function AdCard({ ad }: { ad: AdRow }) {
  const [pending, startTransition] = useTransition()
  const [isEditing, setIsEditing] = useState(false)

  // Bound action: server action recebe id fixo como primeiro argumento.
  // eslint-disable-next-line react/no-unstable-nested-components
  const updateAdWithId = updateAd.bind(null, ad.id)
  const [editState, editAction, editPending] = useActionState<AdResult | null, FormData>(
    updateAdWithId,
    null,
  )

  // Fecha o formulário automaticamente após salvar com sucesso.
  useEffect(() => {
    if (editState && 'ok' in editState) {
      const t = setTimeout(() => setIsEditing(false), 1200)
      return () => clearTimeout(t)
    }
  }, [editState])

  const busy = pending || editPending

  return (
    <div className={`glass glass-card px-4 py-4 space-y-3 transition ${ad.active ? '' : 'opacity-50'}`}>
      {/* Cabeçalho do card */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white/90 truncate">{ad.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <ShoppingBag className="h-3 w-3 shrink-0 text-secondary/60" />
            <p className="text-sm text-secondary/80 truncate">{ad.product_service}</p>
          </div>
        </div>

        {/* Botões de ação */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Editar */}
          <button
            type="button"
            disabled={busy}
            title={isEditing ? 'Fechar edição' : 'Editar'}
            onClick={() => setIsEditing((v) => !v)}
            className={`grid h-8 w-8 place-items-center rounded-xl border transition active:scale-90 disabled:opacity-40 ${
              isEditing
                ? 'border-secondary/40 bg-secondary/10 text-secondary'
                : 'border-white/12 text-white/40 hover:text-white/70'
            }`}
          >
            <Pencil className="h-4 w-4" />
          </button>

          {/* Ativar / desativar */}
          <button
            type="button"
            disabled={busy}
            title={ad.active ? 'Desativar' : 'Ativar'}
            onClick={() => startTransition(() => void toggleAd(ad.id, !ad.active))}
            className="grid h-8 w-8 place-items-center rounded-xl border border-white/12 text-white/40 transition hover:text-white/70 active:scale-90 disabled:opacity-40"
          >
            {ad.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>

          {/* Excluir */}
          <button
            type="button"
            disabled={busy}
            title="Excluir"
            onClick={() => {
              if (!confirm(`Excluir anúncio de "${ad.name}"?`)) return
              startTransition(() => void deleteAd(ad.id))
            }}
            className="grid h-8 w-8 place-items-center rounded-xl border border-red-500/25 text-red-400/70 transition hover:bg-red-500/10 hover:text-red-400 active:scale-90 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Detalhes de contato — visíveis apenas fora da edição */}
      {!isEditing && (
        <div className="space-y-1 text-xs text-white/40">
          {ad.phone   && <p className="flex items-center gap-2"><Phone  className="h-3 w-3 shrink-0" />{ad.phone}</p>}
          {ad.email   && <p className="flex items-center gap-2"><Mail   className="h-3 w-3 shrink-0" />{ad.email}</p>}
          {ad.address && <p className="flex items-start gap-2"><MapPin  className="h-3 w-3 shrink-0 mt-0.5" />{ad.address}</p>}
        </div>
      )}

      {/* Formulário de edição inline */}
      {isEditing && (
        <form action={editAction} className="space-y-3 border-t border-white/8 pt-3">
          {/* Feedback */}
          {editState && 'error' in editState && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {editState.error}
            </div>
          )}
          {editState && 'ok' in editState && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Anúncio atualizado!
            </div>
          )}

          <EditField name="name"            label="Nome / Empresa *"     defaultValue={ad.name}             />
          <EditField name="product_service" label="Produto / Serviço *"  defaultValue={ad.product_service}  />
          <EditField name="phone"           label="Telefone"              defaultValue={ad.phone ?? ''}      />
          <EditField name="email"           label="E-mail"                defaultValue={ad.email ?? ''}      type="email"  />
          <EditField name="address"         label="Endereço"              defaultValue={ad.address ?? ''}    />
          <EditField name="ordering"        label="Ordem de exibição"     defaultValue={String(ad.ordering)} type="number" />

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={editPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-secondary py-2.5 text-xs font-bold text-primary transition active:scale-[0.98] disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              {editPending ? 'Salvando…' : 'Salvar alterações'}
            </button>
            <button
              type="button"
              disabled={editPending}
              onClick={() => setIsEditing(false)}
              className="flex items-center justify-center gap-1.5 rounded-full border border-white/12 px-4 py-2.5 text-xs font-semibold text-white/50 transition hover:text-white/70 active:scale-[0.98] disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" />
              Cancelar
            </button>
          </div>
        </form>
      )}

      {!ad.active && !isEditing && (
        <p className="text-[11px] font-semibold text-white/25">● Inativo — não aparece no Marketplace</p>
      )}
    </div>
  )
}

function EditField({
  name,
  label,
  defaultValue,
  type = 'text',
}: {
  name: string
  label: string
  defaultValue: string
  type?: string
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-white/50">{label}</label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-xl bg-white/6 px-3.5 py-2.5 text-sm text-white placeholder-white/25 outline-none ring-1 ring-white/10 transition focus:ring-secondary/40"
      />
    </div>
  )
}
