'use client'

// Reserva offline do service worker: quando uma navegação não chega ao
// servidor, o SW serve esta página (precacheada) mantendo a URL pedida. Ela
// monta o próprio app — moldura, navegação e a tela pedida a partir dos dados
// do aparelho. Ver OfflineAppShell.

import { OfflineAppShell } from '@/components/offline/OfflineAppShell'

export default function OfflinePage() {
  return <OfflineAppShell />
}
