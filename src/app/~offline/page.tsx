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
import { OfflineBackButton } from '@/components/offline/OfflineBackButton'
import { SyncCenter } from '@/components/offline/SyncCenter'

// Mini-header substituto do TopBar (não disponível fora do layout (app)).
// Lida com safe-area-inset-top p/ o botão Voltar não ficar atrás do relógio.
function OfflineShellHeader() {
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-2.5 px-5 pb-3 bg-primary/80"
      style={{
        paddingTop: 'max(0.75rem, var(--top-inset))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.png" alt="SquashBa" className="h-full w-full object-cover" />
      </div>
      <span className="font-display text-base font-extrabold tracking-tight text-white">
        Squash<span className="text-secondary">Ba</span>
      </span>
      <span className="ml-1 flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-400/80">
        <WifiOff className="h-3 w-3" />
        Offline
      </span>
    </div>
  )
}

// Wrapper que combina o mini-header com o conteúdo.
function OfflineShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <OfflineShellHeader />
      <div className="flex-1">{children}</div>
    </div>
  )
}

function OfflineMessage({ path }: { path?: string }) {
  // Rotas de edição exigem servidor: não há o que "abrir uma vez com internet".
  const isEdit = !!path && /\/editar\/?$/.test(path)
  // Sem histórico (app aberto direto aqui) → sobe um nível da rota atual.
  const fallbackHref = path ? path.replace(/\/[^/]*\/?$/, '') || '/' : '/'

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
        <h1 className="text-lg font-bold text-white">
          {isEdit ? 'Edição indisponível offline' : 'Você está offline'}
        </h1>
        <p className="text-sm text-white/55 leading-relaxed">
          {isEdit
            ? 'Para editar é preciso estar conectado. Volte e tente de novo quando tiver internet.'
            : 'Esta tela ainda não foi carregada offline. Abra-a uma vez com internet para que fique disponível sem conexão.'}
        </p>
        <p className="text-xs text-white/35">
          Placares já abertos continuam funcionando e sincronizam quando você
          voltar a ficar online.
        </p>
        <OfflineBackButton fallbackHref={fallbackHref} className="w-full" />
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
  if (path === null) return <OfflineMessage />  // sem rota ainda: aviso genérico

  // Criar campeonato funciona offline (wizard é client-only).
  if (path === '/campeonatos/novo') {
    return (
      <OfflineShell>
        <ChampionshipWizard />
      </OfflineShell>
    )
  }

  // Pendências de sincronização (lê só o IndexedDB).
  if (path === '/sincronizacao') {
    return (
      <OfflineShell>
        <SyncCenter />
      </OfflineShell>
    )
  }

  // Campeonato provisório (criado offline) — abrir/jogar/placar.
  if (path.startsWith('/pendentes/')) {
    const tempId = decodeURIComponent(path.slice('/pendentes/'.length))
    if (tempId) {
      return (
        <OfflineShell>
          <ProvisionalChampionship tempId={tempId} />
        </OfflineShell>
      )
    }
  }

  // Campeonato REAL (criado online): tela de placar e lista de jogos offline,
  // a partir do cache gravado ao abrir o detalhe com internet.
  const scoreMatch = path.match(/^\/campeonatos\/([^/]+)\/jogos\/([^/]+)$/)
  if (scoreMatch) {
    return (
      <OfflineShell>
        <OfflineScore
          champId={decodeURIComponent(scoreMatch[1])}
          matchId={decodeURIComponent(scoreMatch[2])}
        />
      </OfflineShell>
    )
  }
  const champMatch = path.match(/^\/campeonatos\/([^/]+)$/)
  if (champMatch) {
    return (
      <OfflineShell>
        <OfflineChampMatches champId={decodeURIComponent(champMatch[1])} />
      </OfflineShell>
    )
  }

  return <OfflineMessage path={path} />
}
