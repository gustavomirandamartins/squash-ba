'use client'

/**
 * OfflineSync — montado no shell (app). Drena a fila de criações pendentes ao
 * reconectar, ao voltar para o app ou ao montar online: re-executa cada criação
 * no servidor, remove da fila em caso de sucesso e atualiza a UI
 * (router.refresh). Mostra um chip de status (toque → /sincronizacao) quando
 * offline ou quando há criações, placares ou falhas pendentes.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CloudOff, Loader2 } from 'lucide-react'
import { SYNC_EVENT, getFailures, getPendingMatches } from '@/lib/score-engine/SyncEngine'
import { getOutbox, updateOutbox, removeFromOutbox, OUTBOX_EVENT } from '@/lib/offline/outbox'
import { runCreation } from '@/app/(app)/offline/run-creation'
import { importLocalChampionship } from '@/lib/offline/import-championship'
import { getLocalChampionship, removeLocalChampionship } from '@/lib/offline/local-championship'
import {
  reconcileLocalLiga,
  reconcileLocalBracket,
  reconcileLocalGrupos,
  markLocalSynced,
} from '@/lib/offline/reconcile-liga'

/** Disparado pela tela de sincronização ("Sincronizar agora"). */
export const SYNC_NOW_EVENT = 'sb-sync-now'

export function OfflineSync() {
  const router = useRouter()
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [offline, setOffline] = useState(false)
  const draining = useRef(false)

  // Pendências = criações na fila + partidas com placar ainda não enviado.
  const refreshCounts = useCallback(async () => {
    try {
      const [all, matches, failures] = await Promise.all([getOutbox(), getPendingMatches(), getFailures()])
      setPending(all.length + matches.length)
      setFailed(failures.length + all.filter((i) => i.status === 'error').length)
    } catch {
      /* IndexedDB indisponível: sem chip */
    }
  }, [])

  const drain = useCallback(async () => {
    if (draining.current) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    draining.current = true
    setSyncing(true)
    try {
      const all = await getOutbox()

      // Itens presos em 'syncing' (app foi morto no meio) → volta a 'pending'.
      for (const item of all.filter((i) => i.status === 'syncing')) {
        await updateOutbox(item.tempId, { status: 'pending' })
      }

      // Apenas itens 'pending' são drenados automaticamente.
      // Campeonato provisório sobe por import_championship, idempotente: falha
      // de rede volta a 'pending' e tenta sozinho no próximo gatilho. No caminho
      // antigo (runCreation), itens 'error' SÓ são reprocessados quando o usuário
      // toca em "Tentar novamente", evitando criações duplicadas no servidor
      // (runCreation chamado de novo sem saber se já foi executado).
      const queue = all.filter((i) => i.status === 'pending')
      let didCreate = false
      for (const item of queue) {
        await updateOutbox(item.tempId, { status: 'syncing', error: undefined })
        try {
          // 0. Campeonato provisório: sobe inteiro, com os IDs e placares do
          //    aparelho (Fase 2). Sem a RPC no banco, segue o caminho antigo.
          if (!item.createdRealId) {
            const snapshot = await getLocalChampionship(item.tempId)
            if (snapshot) {
              const imp = await importLocalChampionship(item.tempId, item.op, snapshot)
              if (imp.kind === 'ok') {
                await markLocalSynced(item.tempId, imp.id)
                await removeLocalChampionship(item.tempId)
                await removeFromOutbox(item.tempId)
                didCreate = true
                continue
              }
              if (imp.kind === 'retry') {
                await updateOutbox(item.tempId, { status: 'pending' })
                continue
              }
              if (imp.kind === 'error') {
                await updateOutbox(item.tempId, { status: 'error', error: imp.error })
                continue
              }
            }
          }

          // 1. Cria no servidor (uma única vez — guarda o id real p/ retry seguro).
          let realId = item.createdRealId
          if (!realId) {
            const r = await runCreation(item.op)
            if ('error' in r) {
              await updateOutbox(item.tempId, { status: 'error', error: r.error })
              continue
            }
            realId = r.id
            await updateOutbox(item.tempId, { createdRealId: realId })
          }

          // 2. Migra placares lançados offline (snapshot provisório), se houver.
          const local = await getLocalChampionship(item.tempId)
          if (local) {
            try {
              if (local.format === 'eliminatoria') {
                await reconcileLocalBracket(realId, local)
              } else if (local.format === 'grupos_elim') {
                await reconcileLocalGrupos(realId, local)
              } else {
                await reconcileLocalLiga(realId, local)
              }
            } catch (e) {
              // NÃO recria nem apaga o snapshot: marca erro p/ retry só da migração.
              await updateOutbox(item.tempId, {
                status: 'error',
                error:
                  'Campeonato criado, mas falhou ao enviar os placares: ' +
                  (e instanceof Error ? e.message : 'erro') +
                  '. Toque em "Tentar novamente".',
              })
              continue
            }
            await markLocalSynced(item.tempId, realId)
            await removeLocalChampionship(item.tempId)
          }

          // 3. Tudo certo → sai da fila.
          await removeFromOutbox(item.tempId)
          didCreate = true
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

    const onOnline = () => {
      setOffline(false)
      // Delay: logo após reconectar, o primeiro request costuma falhar ("Load
      // failed") porque a rede ainda não está estável. Aguarda 1.5s antes de
      // drenar para evitar erro transiente → item vai a 'error' sem createdRealId
      // → usuário reabre o app → duplicata.
      setTimeout(() => { void drain() }, 1500)
    }
    const onOffline = () => setOffline(true)
    // iOS: o evento `online` falha com frequência — tenta também ao voltar ao app.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void refreshCounts()
      if (navigator.onLine) void drain()
    }
    const onSyncChange = () => void refreshCounts()
    // Mudança na fila: drena SÓ se houver item 'pending' (ex.: "Tentar
    // novamente"). Itens em 'error' não re-disparam (evita loop de retry).
    const onChange = async () => {
      await refreshCounts()
      if (typeof navigator !== 'undefined' && !navigator.onLine) return
      const all = await getOutbox()
      if (all.some((i) => i.status === 'pending')) void drain()
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener(OUTBOX_EVENT, onChange)
    window.addEventListener(SYNC_EVENT, onSyncChange)
    window.addEventListener(SYNC_NOW_EVENT, onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(SYNC_EVENT, onSyncChange)
      window.removeEventListener(SYNC_NOW_EVENT, onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener(OUTBOX_EVENT, onChange)
    }
  }, [drain, refreshCounts])

  // Nada a mostrar quando online e sem fila.
  if (!offline && pending === 0 && failed === 0) return null

  const label = syncing
    ? 'Sincronizando…'
    : failed > 0
      ? `${failed} com erro`
      : offline
        ? pending > 0
          ? `Offline · ${pending} na fila`
          : 'Offline'
        : `${pending} para sincronizar`

  return (
    <div className="pointer-events-none fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-4 z-50 landscape-sm:left-20 lg:bottom-5">
      <Link
        href="/sincronizacao"
        className="glass glass-pill glass-overlay pointer-events-auto flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white/80"
      >
        {syncing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-secondary" />
        ) : failed > 0 ? (
          <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
        ) : (
          <CloudOff className="h-3.5 w-3.5 text-yellow-400/80" />
        )}
        {label}
      </Link>
    </div>
  )
}
