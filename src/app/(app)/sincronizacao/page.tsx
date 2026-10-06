import { SyncCenter } from '@/components/offline/SyncCenter'

export const metadata = { title: 'Sincronização' }

// Página só de cliente (lê o IndexedDB): funciona offline e é pré-carregada.
export default function SincronizacaoPage() {
  return <SyncCenter />
}
