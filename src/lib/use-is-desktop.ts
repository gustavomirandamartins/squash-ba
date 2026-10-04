'use client'

import { useSyncExternalStore } from 'react'

/**
 * true em tela grande (lg, ≥1024px), false abaixo disso, null no servidor e na
 * hidratação (ainda não se sabe).
 *
 * Usado para MONTAR só a navegação da tela atual: a DesktopSidebar e a
 * BottomNav/TopBar eram escondidas por CSS, mas as duas rodavam ao mesmo tempo
 * — contador de mensagens e sino de notificações em dobro (consultas, canais
 * de tempo real e recargas ao voltar ao app).
 */
const QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

export function useIsDesktop(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => null,
  )
}
