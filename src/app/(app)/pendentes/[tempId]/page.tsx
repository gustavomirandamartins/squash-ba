'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, CloudOff, Loader2, AlertTriangle, Trash2 } from 'lucide-react'
import { getOutbox, removeFromOutbox, updateOutbox, OUTBOX_EVENT } from '@/lib/offline/outbox'
import type { OutboxItem } from '@/lib/offline/types'

export default function PendingDetailPage() {
  const params = useParams<{ tempId: string }>()
  const router = useRouter()
  const tempId = params.tempId
  const [item, setItem] = useState<OutboxItem | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const all = await getOutbox()
      if (cancelled) return
      setItem(all.find((i) => i.tempId === tempId) ?? null)
      setLoaded(true)
    }
    void load()
    const onChange = () => void load()
    window.addEventListener(OUTBOX_EVENT, onChange)
    return () => {
      cancelled = true
      window.removeEventListener(OUTBOX_EVENT, onChange)
    }
  }, [tempId])

  const backHref = item?.kind === 'desafio' ? '/jogos' : '/campeonatos'

  async function cancel() {
    await removeFromOutbox(tempId)
    router.push(backHref)
  }

  async function retry() {
    await updateOutbox(tempId, { status: 'pending', error: undefined })
    // O OfflineSync detecta a mudança e tenta de novo (se online).
  }

  if (loaded && !item) {
    return (
      <div className="px-5 py-8 space-y-4">
        <Link href="/campeonatos" className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80">
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Link>
        <div className="glass glass-card px-4 py-10 text-center space-y-1.5">
          <p className="text-sm font-medium text-white/60">Item já sincronizado</p>
          <p className="text-xs text-white/35">
            Esta criação já foi enviada. Procure na lista de campeonatos ou jogos.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 py-4 space-y-4">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80">
        <ChevronLeft className="h-4 w-4" />
        Voltar
      </Link>

      {item && (
        <>
          <div className="glass glass-card px-5 py-6 text-center space-y-3">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.06]">
              {item.status === 'syncing' ? (
                <Loader2 className="h-6 w-6 animate-spin text-secondary" />
              ) : item.status === 'error' ? (
                <AlertTriangle className="h-6 w-6 text-red-400" />
              ) : (
                <CloudOff className="h-6 w-6 text-yellow-400/80" />
              )}
            </div>
            <div>
              <h1 className="font-display text-xl font-extrabold tracking-tight text-white">{item.snapshot.name}</h1>
              <p className="mt-1 text-sm text-white/45">{item.snapshot.subtitle}</p>
            </div>
            <p className="text-xs leading-relaxed text-white/40 max-w-xs mx-auto">
              {item.status === 'syncing'
                ? 'Enviando para o servidor…'
                : item.status === 'error'
                  ? 'Não foi possível criar. Tente novamente quando estiver online.'
                  : 'Criado offline. Será enviado automaticamente assim que você reconectar.'}
            </p>
          </div>

          {item.status === 'error' && item.error && (
            <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-xs text-red-300">{item.error}</p>
          )}

          <div className="flex gap-2">
            {item.status === 'error' && (
              <button
                type="button"
                onClick={() => void retry()}
                className="flex-1 rounded-2xl bg-secondary py-3 text-sm font-bold text-primary transition active:scale-95"
              >
                Tentar novamente
              </button>
            )}
            <button
              type="button"
              onClick={() => void cancel()}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-500/30 py-3 text-sm font-semibold text-red-300 transition active:scale-95 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
