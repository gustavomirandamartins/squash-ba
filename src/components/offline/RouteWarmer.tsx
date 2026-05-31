'use client'

import { useEffect } from 'react'

/**
 * Aquece o cache offline de rotas dinâmicas (ex.: detalhe de cada liga) enquanto
 * o usuário está online, para que abram offline mesmo sem visita manual.
 *
 * Dispara, para cada path, uma requisição de documento e uma de payload RSC. O
 * service worker as intercepta e cacheia por pathname (network-first). Sem SW
 * (dev) ou offline, é no-op.
 */
export function RouteWarmer({ paths, max = 20 }: { paths: string[]; max?: number }) {
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
            fetch(path, { credentials: 'same-origin' }).catch(() => {})
            fetch(path, { credentials: 'same-origin', headers: { RSC: '1' } }).catch(() => {})
          }
        }, 2000)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [key])

  return null
}
