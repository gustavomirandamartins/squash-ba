'use client'

/**
 * SyncCenter — tudo que ainda não chegou ao servidor, num lugar só:
 *   • campeonatos/desafios criados offline (fila de criação);
 *   • partidas com placar aguardando envio (fila de placar);
 *   • ações que o servidor recusou (com "Tentar de novo" e "Descartar").
 * Funciona offline: lê só o IndexedDB.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ChevronRight, CloudOff, Loader2, RefreshCw, RefreshCcw, Trash2 } from 'lucide-react'
import { getOutbox, OUTBOX_EVENT } from '@/lib/offline/outbox'
import type { OutboxItem } from '@/lib/offline/types'
import {
  SYNC_EVENT,
  dismissFailure,
  flushAllPending,
  getFailures,
  getPendingMatches,
  getSyncMeta,
  retryFailure,
  type PendingMatch,
  type SyncFailure,
  type SyncMeta,
} from '@/lib/score-engine/SyncEngine'
import { SYNC_NOW_EVENT } from '@/components/offline/OfflineSync'

type FailureRow = SyncFailure & { meta: SyncMeta | null }

const ACTION_LABEL: Record<string, string> = {
  upsert_game: 'Placar',
  delete_game: 'Exclusão de set',
  finalize_match: 'Encerramento',
  finish_timer: 'Fim do cronômetro',
}

export function SyncCenter() {
  const [creations, setCreations] = useState<OutboxItem[]>([])
  const [matches, setMatches] = useState<PendingMatch[]>([])
  const [failures, setFailures] = useState<FailureRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [offline, setOffline] = useState(false)

  const load = useCallback(async () => {
    try {
      const [o, m, f] = await Promise.all([getOutbox(), getPendingMatches(), getFailures()])
      const withMeta = await Promise.all(f.map(async (x) => ({ ...x, meta: await getSyncMeta(x.matchId) })))
      setCreations(o)
      setMatches(m)
      setFailures(withMeta.sort((a, b) => b.at - a.at))
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void load()
    const onChange = () => void load()
    const onNet = () => setOffline(!navigator.onLine)
    onNet()
    window.addEventListener(OUTBOX_EVENT, onChange)
    window.addEventListener(SYNC_EVENT, onChange)
    window.addEventListener('online', onNet)
    window.addEventListener('offline', onNet)
    return () => {
      window.removeEventListener(OUTBOX_EVENT, onChange)
      window.removeEventListener(SYNC_EVENT, onChange)
      window.removeEventListener('online', onNet)
      window.removeEventListener('offline', onNet)
    }
  }, [load])

  async function syncNow() {
    setSyncing(true)
    try {
      window.dispatchEvent(new Event(SYNC_NOW_EVENT)) // criações (OfflineSync)
      await flushAllPending() // placares
      await load()
    } finally {
      setSyncing(false)
    }
  }

  const nothing = loaded && creations.length === 0 && matches.length === 0 && failures.length === 0

  return (
    <div className="px-5 py-6 space-y-5">
      <div>
        <h1 className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <RefreshCcw className="h-5 w-5 text-secondary" />
          Sincronização
        </h1>
        <p className="mt-1 text-sm text-white/40">O que está salvo neste aparelho e ainda não foi enviado</p>
      </div>

      <button
        type="button"
        onClick={() => void syncNow()}
        disabled={syncing || offline}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-bold text-primary transition active:scale-95 disabled:opacity-40"
      >
        {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {offline ? 'Sem conexão' : syncing ? 'Sincronizando…' : 'Sincronizar agora'}
      </button>

      {nothing && (
        <div className="glass glass-card px-4 py-10 text-center space-y-2">
          <CheckCircle2 className="mx-auto h-7 w-7 text-secondary" />
          <p className="text-sm font-medium text-white/70">Tudo sincronizado</p>
          <p className="text-xs text-white/35">Nenhum dado pendente neste aparelho.</p>
        </div>
      )}

      {failures.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-red-300/80">
            Recusados pelo servidor
          </h2>
          {failures.map((f) => (
            <div key={f.id} className="glass glass-card space-y-2.5 px-4 py-3.5" style={{ borderColor: 'rgba(248,113,113,0.35)' }}>
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white/85">
                    {f.meta?.label ?? 'Partida'}
                  </p>
                  <p className="mt-0.5 text-xs text-white/45">
                    {f.action ? ACTION_LABEL[f.action.type] ?? f.action.type : 'Ação'} ·{' '}
                    {new Date(f.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                  <p className="mt-1 text-xs text-red-300/80">{f.error}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {f.action && (
                  <button
                    type="button"
                    onClick={() => void retryFailure(f.id)}
                    className="flex-1 rounded-xl bg-white/[0.08] py-2 text-xs font-semibold text-white/75 transition active:scale-95"
                  >
                    Tentar de novo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void dismissFailure(f.id)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-500/30 py-2 text-xs font-semibold text-red-300 transition active:scale-95"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Descartar
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {creations.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-white/35">
            Criados offline
          </h2>
          {creations.map((it) => (
            <Link
              key={it.tempId}
              href={`/pendentes/${it.tempId}`}
              className="glass glass-card flex items-center gap-3 px-4 py-3.5 transition active:scale-[0.985]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white/85">{it.snapshot.name}</p>
                <p className="mt-0.5 truncate text-xs text-white/40">{it.snapshot.subtitle}</p>
                {it.status === 'error' && it.error && (
                  <p className="mt-1 text-xs text-red-300/80">{it.error}</p>
                )}
              </div>
              <StatusPill status={it.status} />
              <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
            </Link>
          ))}
        </section>
      )}

      {matches.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-white/35">
            Placares aguardando envio
          </h2>
          {matches.map((m) => {
            const inner = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white/85">{m.meta?.label ?? 'Partida'}</p>
                  <p className="mt-0.5 text-xs text-white/40">
                    {m.count} {m.count === 1 ? 'alteração' : 'alterações'} na fila
                  </p>
                </div>
                <StatusPill status="pending" />
              </>
            )
            return m.meta?.href ? (
              <Link
                key={m.matchId}
                href={m.meta.href}
                className="glass glass-card flex items-center gap-3 px-4 py-3.5 transition active:scale-[0.985]"
              >
                {inner}
                <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
              </Link>
            ) : (
              <div key={m.matchId} className="glass glass-card flex items-center gap-3 px-4 py-3.5">
                {inner}
              </div>
            )
          })}
        </section>
      )}

      <p className="px-2 text-center text-[11px] leading-relaxed text-white/25">
        Os dados ficam salvos neste aparelho e são enviados sozinhos quando houver conexão.
        Não desinstale o app nem limpe os dados do navegador com itens pendentes.
      </p>
    </div>
  )
}

function StatusPill({ status }: { status: OutboxItem['status'] }) {
  if (status === 'syncing') {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-[10px] font-semibold text-secondary">
        <Loader2 className="h-3 w-3 animate-spin" />
        Enviando
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
