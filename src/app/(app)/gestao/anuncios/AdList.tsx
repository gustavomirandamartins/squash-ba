'use client'

import { useTransition } from 'react'
import { Phone, Mail, MapPin, Trash2, Eye, EyeOff, ShoppingBag } from 'lucide-react'
import { toggleAd, deleteAd } from './actions'
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

  return (
    <div className={`glass glass-card px-4 py-4 space-y-3 transition ${ad.active ? '' : 'opacity-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white/90 truncate">{ad.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <ShoppingBag className="h-3 w-3 shrink-0 text-secondary/60" />
            <p className="text-sm text-secondary/80 truncate">{ad.product_service}</p>
          </div>
        </div>

        {/* Ações */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={pending}
            title={ad.active ? 'Desativar' : 'Ativar'}
            onClick={() => startTransition(() => void toggleAd(ad.id, !ad.active))}
            className="grid h-8 w-8 place-items-center rounded-xl border border-white/12 text-white/40 transition hover:text-white/70 active:scale-90 disabled:opacity-40"
          >
            {ad.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <button
            type="button"
            disabled={pending}
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

      {/* Detalhes de contato */}
      <div className="space-y-1 text-xs text-white/40">
        {ad.phone   && <p className="flex items-center gap-2"><Phone  className="h-3 w-3 shrink-0" />{ad.phone}</p>}
        {ad.email   && <p className="flex items-center gap-2"><Mail   className="h-3 w-3 shrink-0" />{ad.email}</p>}
        {ad.address && <p className="flex items-start gap-2"><MapPin  className="h-3 w-3 shrink-0 mt-0.5" />{ad.address}</p>}
      </div>

      {!ad.active && (
        <p className="text-[11px] font-semibold text-white/25">● Inativo — não aparece no Marketplace</p>
      )}
    </div>
  )
}
