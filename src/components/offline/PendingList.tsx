'use client'

/**
 * PendingList — ilha client que mostra criações pendentes de sincronização
 * (ficaram na fila por terem sido criadas offline). Aparece no topo das listas
 * de Campeonatos e Jogos. Some sozinha quando o item sincroniza.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CloudOff, Loader2, AlertTriangle, Trophy, Swords } from 'lucide-react'
import { getOutbox, OUTBOX_EVENT } from '@/lib/offline/outbox'
import type { OutboxItem, CreationKind } from '@/lib/offline/types'

export function PendingList({ kind }: { kind: CreationKind }) {
  const [items, setItems] = useState<OutboxItem[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const all = await getOutbox()
      if (!cancelled) setItems(all.filter((i) => i.kind === kind))
    }
    void load()
    const onChange = () => void load()
    window.addEventListener(OUTBOX_EVENT, onChange)
    return () => {
      cancelled = true
      window.removeEventListener(OUTBOX_EVENT, onChange)
    }
  }, [kind])

  if (items.length === 0) return null

  const Icon = kind === 'campeonato' ? Trophy : Swords

  return (
    <div className="space-y-2">
      {items.map((it) => (
        <Link
          key={it.tempId}
          href={`/pendentes/${it.tempId}`}
          className="glass glass-card flex items-center gap-3 px-4 py-3.5 transition active:scale-[0.985]"
          style={{ borderColor: it.status === 'error' ? 'rgba(248,113,113,0.4)' : undefined }}
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
            <Icon className="h-4 w-4 text-white/45" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white/85">{it.snapshot.name}</p>
            <p className="mt-0.5 truncate text-xs text-white/40">{it.snapshot.subtitle}</p>
          </div>
          <StatusBadge status={it.status} />
        </Link>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: OutboxItem['status'] }) {
  if (status === 'syncing') {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-[10px] font-semibold text-secondary">
        <Loader2 className="h-3 w-3 animate-spin" />
        Sincronizando
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-semibold text-red-300">
        <AlertTriangle className="h-3 w-3" />
        Falhou
      </span>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-yellow-500/12 px-2.5 py-1 text-[10px] font-semibold text-yellow-400/80">
      <CloudOff className="h-3 w-3" />
      Na fila
    </span>
  )
}
