'use client'

/**
 * OfflinePreloader — ao abrir o app (uma vez por sessão, estando online),
 * pré-carrega para uso offline:
 *   • pool de jogadores + categorias (IndexedDB) → criar campeonato/desafio
 *   • páginas principais (documento + RSC) → o Serwist cacheia em runtime
 *   • as ligas e desafios DO USUÁRIO (rotas de detalhe) → abrir offline
 *
 * Mostra um chip de progresso e, ao concluir, o aviso
 * "Dados carregados para uso offline".
 */

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { loadPlayerPool, loadCategories } from '@/lib/offline/players-cache'

const SESSION_KEY = 'sb-offline-preloaded'

const CORE_ROUTES = [
  '/',
  '/campeonatos',
  '/jogos',
  '/comunidade',
  '/mensagens',
  '/campeonatos/novo',
  '/desafios/novo',
  '/perfil',
]

type Phase = 'idle' | 'loading' | 'done'

function warm(path: string): Promise<unknown> {
  // Documento + payload RSC; o service worker (Serwist) intercepta e cacheia.
  return Promise.allSettled([
    fetch(path, { credentials: 'same-origin' }),
    fetch(path, { credentials: 'same-origin', headers: { RSC: '1' } }),
  ])
}

export function OfflinePreloader() {
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if (!('serviceWorker' in navigator)) return
    if (sessionStorage.getItem(SESSION_KEY)) return
    sessionStorage.setItem(SESSION_KEY, '1')

    let cancelled = false
    setPhase('loading')

    ;(async () => {
      try {
        // Garante o SW ativo antes de aquecer as páginas.
        await navigator.serviceWorker.ready

        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        // Rotas de detalhe das participações do usuário (ligas + desafios).
        const dynamicRoutes: string[] = []
        if (user) {
          const { data } = await supabase
            .from('participant_members')
            .select('participants!inner(championships!inner(id, format))')
            .eq('user_id', user.id)
            .limit(60)

          const seen = new Set<string>()
          for (const row of data ?? []) {
            const participant = (row as unknown as {
              participants?: { championships?: { id: string; format: string } | { id: string; format: string }[] }
            }).participants
            const champ = Array.isArray(participant?.championships)
              ? participant?.championships[0]
              : participant?.championships
            if (!champ || seen.has(champ.id)) continue
            seen.add(champ.id)
            dynamicRoutes.push(
              champ.format === 'desafio' ? `/desafios/${champ.id}` : `/campeonatos/${champ.id}`,
            )
          }
        }

        const routes = [...CORE_ROUTES, ...dynamicRoutes]
        await Promise.allSettled([
          loadPlayerPool(),
          loadCategories(),
          ...routes.map((p) => warm(p)),
        ])
      } catch {
        /* best-effort */
      }

      if (cancelled) return
      setPhase('done')
      // Some sozinho após alguns segundos.
      setTimeout(() => {
        if (!cancelled) setPhase('idle')
      }, 4500)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  if (phase === 'idle') return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex justify-center px-4">
      <div
        className={`glass glass-pill pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold shadow-lg transition-all duration-300 ${
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
