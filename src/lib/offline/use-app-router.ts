'use client'

// useRouter que respeita o shell offline: com ele montado, push/replace para
// telas que ele desenha só trocam a URL (shellNavigate), sem ir ao servidor nem
// recarregar. Fora do shell é o roteador do Next, sem diferença.

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { shellNavigate } from './shell-nav'

export function useAppRouter() {
  const router = useRouter()
  return useMemo(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) => {
        if (!shellNavigate(href)) router.push(href, options)
      },
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) => {
        if (!shellNavigate(href, true)) router.replace(href, options)
      },
    }),
    [router],
  )
}
