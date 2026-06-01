'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Aquece o cache offline de rotas dinâmicas (ex.: detalhe de cada liga) enquanto
 * o usuário está online, para que abram offline mesmo sem visita manual.
 *
 * Usa router.prefetch (mecanismo nativo do Next: emite a requisição RSC no mesmo
 * formato que a navegação client-side usa depois, e o Serwist a cacheia) + um
 * fetch de reforço. Sem SW (dev) ou offline, é no-op.
 */
export function RouteWarmer({ paths, max = 20 }: { paths: string[]; max?: number }) {
  const router = useRouter()
  const key = paths.slice(0, max).join(',')

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if (!key) return

    let cancelled = false
    navigator.serviceWorker.ready
      .then(() => {
        if (cancelled) return
        // Atraso para não competir com a navegação/render inicial.
        setTimeout(() => {
          if (cancelled) return
          for (const path of key.split(',')) {
            try { router.prefetch(path) } catch { /* ignore */ }
            fetch(path, { credentials: 'same-origin', headers: { RSC: '1' } }).catch(() => {})
          }
        }, 2000)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return null
}
