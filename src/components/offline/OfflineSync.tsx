'use client'

/**
 * OfflineSync — montado no shell (app). Drena a fila de criações pendentes ao
 * reconectar (ou ao montar online): re-executa cada criação no servidor, remove
 * da fila em caso de sucesso e atualiza a UI (router.refresh). Mostra um chip
 * de status quando offline ou quando há itens na fila.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CloudOff, Loader2 } from 'lucide-react'
import { getOutbox, updateOutbox, removeFromOutbox, OUTBOX_EVENT } from '@/lib/offline/outbox'
import { runCreation } from '@/app/(app)/offline/run-creation'
import { getLocalChampionship, removeLocalChampionship } from '@/lib/offline/local-championship'
import { reconcileLocalLiga, markLocalSynced } from '@/lib/offline/reconcile-liga'

export function OfflineSync() {
  const router = useRouter()
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [offline, setOffline] = useState(false)
  const draining = useRef(false)

  const refreshCounts = useCallback(async () => {
    const all = await getOutbox()
    setPending(all.length)
  }, [])

  const drain = useCallback(async () => {
    if (draining.current) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    draining.current = true
    setSyncing(true)
    try {
      const all = await getOutbox()
      const queue = all.filter((i) => i.status !== 'syncing')
      let didCreate = false
      for (const item of queue) {
        await updateOutbox(item.tempId, { status: 'syncing', error: undefined })
        try {
          const r = await runCreation(item.op)
          if ('error' in r) {
            await updateOutbox(item.tempId, { status: 'error', error: r.error })
          } else {
            // Campeonato criado no servidor. Se havia snapshot local (Liga
            // provisória), migra os placares lançados offline para as partidas
            // reais e registra o mapeamento p/ a tela provisória redirecionar.
            const local = await getLocalChampionship(item.tempId)
            if (local) {
              try {
                await reconcileLocalLiga(r.id, local)
                await markLocalSynced(item.tempId, r.id)
                await removeLocalChampionship(item.tempId)
              } catch {
                // Best-effort: o campeonato existe; mantém o snapshot para não
                // recriar (runCreation não é idempotente) e segue.
                await markLocalSynced(item.tempId, r.id)
              }
            }
            await removeFromOutbox(item.tempId)
            didCreate = true
          }
        } catch (e) {
          await updateOutbox(item.tempId, {
            status: 'error',
            error: e instanceof Error ? e.message : 'Falha ao sincronizar.',
          })
        }
      }
      await refreshCounts()
      if (didCreate) router.refresh()
    } finally {
      draining.current = false
      setSyncing(false)
    }
  }, [router, refreshCounts])

  useEffect(() => {
    const updateOnline = () => {
      const isOff = typeof navigator !== 'undefined' && !navigator.onLine
      setOffline(isOff)
      if (!isOff) void drain()
    }
    updateOnline()
    void refreshCounts()

    const onOnline = () => { setOffline(false); void drain() }
    const onOffline = () => setOffline(true)
    const onChange = () => void refreshCounts()

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener(OUTBOX_EVENT, onChange)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener(OUTBOX_EVENT, onChange)
    }
  }, [drain, refreshCounts])

  // Nada a mostrar quando online e sem fila.
  if (!offline && pending === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-4 z-50 lg:bottom-5">
      <div className="glass glass-pill pointer-events-auto flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white/80">
        {syncing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-secondary" />
        ) : (
          <CloudOff className="h-3.5 w-3.5 text-yellow-400/80" />
        )}
        {syncing
          ? 'Sincronizando…'
          : offline
            ? pending > 0
              ? `Offline · ${pending} na fila`
              : 'Offline'
            : pending > 0
              ? `${pending} para sincronizar`
              : ''}
      </div>
    </div>
  )
}
