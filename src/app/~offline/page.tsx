'use client'

// Shell offline inteligente.
//
// Esta página é PRECACHEADA pelo Serwist, então está SEMPRE disponível offline.
// Quando uma navegação falha offline, o Serwist serve este conteúdo (mantendo a
// URL pedida). Como /campeonatos/novo e /pendentes/[tempId] são páginas 100%
// client-side (sem dados do servidor), aqui detectamos a URL pedida e renderizamos
// o componente certo — fazendo "criar e usar campeonato" funcionar offline mesmo
// que o cache de rotas falhe.
//
// A decisão é feita APÓS montar (useEffect) para casar com o HTML precacheado e
// evitar hydration mismatch.

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { ChampionshipWizard } from '@/components/campeonatos/ChampionshipWizard'
import { ProvisionalChampionship } from '@/components/offline/ProvisionalChampionship'
import { OfflineChampMatches, OfflineScore } from '@/components/offline/OfflineChampionshipView'

function OfflineMessage() {
  return (
    <div
      className="min-h-dvh grid place-items-center px-6 text-center"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #16233a 100%)',
      }}
    >
      <div className="max-w-xs space-y-4">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-secondary/12 grid place-items-center ring-1 ring-secondary/25">
          <WifiOff className="h-7 w-7 text-secondary/70" />
        </div>
        <h1 className="text-lg font-bold text-white">Você está offline</h1>
        <p className="text-sm text-white/55 leading-relaxed">
          Esta tela ainda não foi carregada offline. Abra-a uma vez com internet
          para que fique disponível sem conexão.
        </p>
        <p className="text-xs text-white/35">
          Placares já abertos continuam funcionando e sincronizam quando você
          voltar a ficar online.
        </p>
      </div>
    </div>
  )
}

export default function OfflinePage() {
  const [path, setPath] = useState<string | null>(null)

  useEffect(() => {
    setPath(window.location.pathname)
  }, [])

  // Primeiro paint = mensagem offline (casa com o HTML precacheado).
  if (path === null) return <OfflineMessage />

  // Criar campeonato funciona offline (wizard é client-only).
  if (path === '/campeonatos/novo') {
    return <ChampionshipWizard />
  }

  // Campeonato provisório (criado offline) — abrir/jogar/placar.
  if (path.startsWith('/pendentes/')) {
    const tempId = decodeURIComponent(path.slice('/pendentes/'.length))
    if (tempId) return <ProvisionalChampionship tempId={tempId} />
  }

  // Campeonato REAL (criado online): tela de placar e lista de jogos offline,
  // a partir do cache gravado ao abrir o detalhe com internet.
  const scoreMatch = path.match(/^\/campeonatos\/([^/]+)\/jogos\/([^/]+)$/)
  if (scoreMatch) {
    return <OfflineScore champId={decodeURIComponent(scoreMatch[1])} matchId={decodeURIComponent(scoreMatch[2])} />
  }
  const champMatch = path.match(/^\/campeonatos\/([^/]+)$/)
  if (champMatch) {
    return <OfflineChampMatches champId={decodeURIComponent(champMatch[1])} />
  }

  return <OfflineMessage />
}
