import { redirect } from 'next/navigation'

// A rota /jogos foi substituída pelo Marketplace.
// Redirecionamos para manter compatibilidade com bookmarks/PWA cache.
export default function JogosPage() {
  redirect('/marketplace')
}
