'use client'

/**
 * OfflinePreloader — pré-carrega para uso offline, sem disputar a rede com o
 * usuário:
 *   • pool de jogadores + categorias + times/elencos (IndexedDB) → criar
 *     campeonato/desafio offline
 *   • páginas principais + campeonatos/desafios EM ABERTO do usuário (em que
 *     joga ou que organiza) → o documento HTML fica no cache do service worker.
 *     Offline, quando a navegação client-side falha, o Next cai para navegação
 *     de documento e o SW serve essa cópia.
 *   • a ESTRUTURA desses campeonatos (jogos, chave, grupos, lados) no IndexedDB
 *     (refreshChampCache) → lista de jogos, placar e avanço da chave offline.
 *     Esta parte roda a cada abertura do app com internet (é leve: 1 consulta
 *     por campeonato), não só a cada 6 h.
 *
 * Regras para não pesar:
 *   • no máximo a cada 6 h (localStorage — no web app do iOS o sessionStorage
 *     zera a cada reabertura, o que disparava tudo de novo);
 *   • começa só depois que a tela inicial assentou (atraso + tempo ocioso);
 *   • 1 requisição por rota, 2 por vez;
 *   • só campeonatos/desafios ainda não encerrados (até 12).
 */

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { loadPlayerPool, loadCategories, loadTeamsWithRosters } from '@/lib/offline/players-cache'
import { startBackgroundSync } from '@/lib/score-engine/SyncEngine'
import { refreshChampCache } from '@/lib/offline/champ-cache'

const STAMP_KEY = 'sb-offline-preloaded-at'
const TTL_MS = 6 * 60 * 60 * 1000
const START_DELAY_MS = 4000
const CONCURRENCY = 2
const MAX_DYNAMIC = 12

const CORE_ROUTES = [
  '/',
  '/campeonatos',
  '/desafios',
  '/comunidade',
  '/mensagens',
  '/campeonatos/novo',
  '/desafios/novo',
  '/perfil',
  '/sincronizacao',
]

type Phase = 'idle' | 'loading' | 'done'

function readStamp(): number {
  try {
    return Number(localStorage.getItem(STAMP_KEY) ?? 0)
  } catch {
    return 0
  }
}

function writeStamp() {
  try {
    localStorage.setItem(STAMP_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

/** Espera o navegador ficar ocioso (com teto, para não esperar para sempre). */
function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }).requestIdleCallback
    if (ric) ric(() => resolve(), { timeout: 3000 })
    else setTimeout(resolve, 500)
  })
}

/** Busca as rotas com no máximo `limit` requisições simultâneas. */
async function warmAll(paths: string[], limit: number, isCancelled: () => boolean) {
  let next = 0
  async function worker() {
    while (next < paths.length && !isCancelled()) {
      const path = paths[next++]
      try {
        await fetch(path, { credentials: 'same-origin' })
      } catch {
        /* best-effort */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, paths.length) }, worker))
}

type OpenChamp = { id: string; format: string }

/** Campeonatos/desafios ainda em aberto em que o usuário joga ou que organiza. */
async function listOpenChampionships(userId: string): Promise<OpenChamp[]> {
  const supabase = createClient()
  const [{ data: playing }, { data: organizing }] = await Promise.all([
    supabase
      .from('participant_members')
      .select('participants!inner(championships!inner(id, format, status))')
      .eq('user_id', userId)
      .neq('participants.championships.status', 'encerrado')
      .limit(40),
    supabase
      .from('championships')
      .select('id, format')
      .eq('created_by', userId)
      .neq('status', 'encerrado')
      .order('created_at', { ascending: false })
      .limit(MAX_DYNAMIC),
  ])

  const out: OpenChamp[] = []
  const seen = new Set<string>()
  const add = (c: OpenChamp | undefined) => {
    if (!c || seen.has(c.id) || out.length >= MAX_DYNAMIC) return
    seen.add(c.id)
    out.push(c)
  }
  // Organizados primeiro: quem marca o placar é o organizador.
  for (const c of organizing ?? []) add(c as OpenChamp)
  for (const row of playing ?? []) {
    const participant = (row as unknown as {
      participants?: { championships?: OpenChamp | OpenChamp[] }
    }).participants
    add(Array.isArray(participant?.championships) ? participant?.championships[0] : participant?.championships)
  }
  return out
}

const routeOf = (c: OpenChamp) => (c.format === 'desafio' ? `/desafios/${c.id}` : `/campeonatos/${c.id}`)

export function OfflinePreloader() {
  const [phase, setPhase] = useState<Phase>('idle')

  // Envia filas de placar pendentes em qualquer tela: ao abrir, ao voltar para
  // o app, ao reconectar e, havendo pendência, com espera crescente. Placares
  // gravados com o app fechado antes de sincronizar não se perdem.
  useEffect(() => startBackgroundSync(), [])

  // Pede armazenamento persistente: sem isso o navegador pode apagar o
  // IndexedDB (filas e campeonatos provisórios) quando falta espaço.
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => {})
  }, [])

  // Estrutura dos campeonatos em aberto → IndexedDB, a cada abertura com rede
  // e ao reconectar (um por vez, depois que a tela assentou).
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        void (async () => {
          if (navigator.onLine === false) return
          try {
            await whenIdle()
            const { data: { session } } = await createClient().auth.getSession()
            const userId = session?.user.id
            if (!userId || cancelled) return
            for (const c of await listOpenChampionships(userId)) {
              if (cancelled) return
              await refreshChampCache(c.id)
            }
          } catch {
            /* best-effort */
          }
        })()
      }, START_DELAY_MS)
    }
    run()
    window.addEventListener('online', run)
    return () => {
      cancelled = true
      clearTimeout(timer)
      window.removeEventListener('online', run)
    }
  }, [])

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if (!('serviceWorker' in navigator)) return
    if (Date.now() - readStamp() < TTL_MS) return

    let cancelled = false
    const isCancelled = () => cancelled

    const timer = setTimeout(() => {
      void (async () => {
        try {
          await whenIdle()
          await navigator.serviceWorker.ready
          if (cancelled) return
          setPhase('loading')

          const supabase = createClient()
          const { data: { session } } = await supabase.auth.getSession()
          const userId = session?.user.id

          // Campeonatos/desafios do usuário ainda em aberto.
          const dynamicRoutes = userId ? (await listOpenChampionships(userId)).map(routeOf) : []

          await Promise.allSettled([loadPlayerPool(), loadCategories(), loadTeamsWithRosters()])
          await warmAll([...CORE_ROUTES, ...dynamicRoutes], CONCURRENCY, isCancelled)
          if (cancelled) return
          writeStamp()
        } catch {
          /* best-effort */
        }

        if (cancelled) return
        setPhase('done')
        setTimeout(() => {
          if (!cancelled) setPhase('idle')
        }, 4500)
      })()
    }, START_DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  if (phase === 'idle') return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,var(--top-inset))] z-[60] flex justify-center px-4">
      <div
        className={`glass glass-overlay glass-pill pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold shadow-lg transition-all duration-300 ${
          phase === 'done' ? 'text-secondary' : 'text-white/80'
        }`}
        style={{ animation: 'reveal-up 0.3s ease-out' }}
      >
        {phase === 'loading' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-secondary shrink-0" />
            <span>Carregando dados para uso offline…</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4 text-secondary shrink-0" />
            <span>Dados carregados para uso offline</span>
            <button
              type="button"
              onClick={() => setPhase('idle')}
              className="ml-1 text-white/30 hover:text-white/60 transition"
              aria-label="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
