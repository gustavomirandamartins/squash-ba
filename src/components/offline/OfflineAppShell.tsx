'use client'

// Shell offline — o MESMO app quando a rede falha.
//
// Servido pelo service worker (página /~offline, precacheada) no lugar de
// qualquer navegação que não chegou ao servidor, mantendo a URL pedida. Monta a
// moldura do app (TopBar + navegação inferior) com o perfil guardado no aparelho
// e desenha a tela pedida a partir dos dados locais:
//   • campeonato / desafio / jogo reais → cache da estrutura + fila (chave anda);
//   • campeonato provisório, criação (campeonato e desafio) e Pendências;
//   • início e listas → o que está guardado no aparelho.
// Navegar entre essas telas não recarrega a página: os links são tratados aqui
// (history.pushState, que o roteador do Next acompanha). O resto segue o
// caminho normal (cópia em cache ou de volta a este shell).

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { RefreshCw, WifiOff } from 'lucide-react'
import { AppFrame } from '@/components/AppFrame'
import { ChampionshipWizard } from '@/components/campeonatos/ChampionshipWizard'
import { ChallengeWizard } from '@/components/desafios/ChallengeWizard'
import { ProvisionalChampionship } from '@/components/offline/ProvisionalChampionship'
import { OfflineChampMatches, OfflineScore } from '@/components/offline/OfflineChampionshipView'
import { OfflineBackButton } from '@/components/offline/OfflineBackButton'
import { SyncCenter } from '@/components/offline/SyncCenter'
import { PendingList } from '@/components/offline/PendingList'
import { OfflineSync } from '@/components/offline/OfflineSync'
import { OfflinePreloader } from '@/components/offline/OfflinePreloader'
import { listCachedChamps, type CachedChampSummary } from '@/lib/offline/champ-cache'
import { CampeonatosListClient } from '@/components/campeonatos/CampeonatosListClient'
import {
  CampeonatosHeader, ChampionshipsLabel, MyChallengesSection, NoChampionships,
} from '@/components/campeonatos/CampeonatosPageParts'
import { WelcomeHeader } from '@/components/home/WelcomeHeader'
import { OngoingSection } from '@/components/home/OngoingSection'
import {
  parseShellProfile, readShellProfileRaw, subscribeShellProfile, type ShellProfile,
} from '@/lib/offline/shell-profile'
import { setShellActive, shellNavigate, shellRoute } from '@/lib/offline/shell-nav'

// ── Estado do navegador (sem efeitos) ────────────────────────────────────────

const noop = () => () => {}
const useMounted = () => useSyncExternalStore(noop, () => true, () => false)

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}
const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => false)

/**
 * Links para telas do shell: troca a URL sem recarregar. Telas de dados locais
 * (campeonato, jogo, provisório, criação) sempre; início e listas só sem rede
 * (com rede, o caminho normal traz a versão do servidor).
 */
function useShellLinks(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      if (!shellNavigate(a.href)) return
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [enabled])
}

// ── Shell ────────────────────────────────────────────────────────────────────

export function OfflineAppShell() {
  const mounted = useMounted()
  const pathname = usePathname()
  const raw = useSyncExternalStore(subscribeShellProfile, readShellProfileRaw, () => null)
  const profile = useMemo(() => parseShellProfile(raw), [raw])

  useShellLinks(mounted && !!profile)

  // Enquanto o shell está montado, as navegações do app entre telas locais
  // (voltar do placar, abrir o provisório criado) trocam só a URL.
  const active = mounted && !!profile
  useEffect(() => {
    if (!active) return
    setShellActive(true)
    return () => setShellActive(false)
  }, [active])

  // Nova tela → topo (o <main> da moldura é quem rola).
  useEffect(() => {
    document.querySelector('main')?.scrollTo(0, 0)
  }, [pathname])

  // Primeiro paint = vazio (casa com o HTML precacheado; a rota só é conhecida
  // no aparelho).
  if (!mounted) return <div className="min-h-dvh" />

  // Nunca abriu o app logado neste aparelho: não há moldura para montar.
  if (!profile) return <StandaloneMessage path={pathname} />

  return (
    <AppFrame
      profile={profile}
      extras={
        <>
          <OfflineSync />
          <OfflinePreloader />
          <BackOnline />
        </>
      }
    >
      <ShellScreen path={pathname} profile={profile} />
    </AppFrame>
  )
}

function ShellScreen({ path, profile }: { path: string; profile: ShellProfile }) {
  const { userId } = profile
  const route = shellRoute(path)
  if (!route) return <ShellMessage path={path} />
  switch (route.kind) {
    case 'home':
      return route.filter === 'all'
        ? <OfflineInicio name={profile.name} gender={profile.gender ?? null} />
        : <OfflineCampeonatos />
    case 'champ-new':
      return <ChampionshipWizard />
    case 'desafio-new':
      return <ChallengeWizard currentUserId={userId} />
    case 'sync':
      return <SyncCenter />
    case 'provisional':
      return <ProvisionalChampionship key={route.tempId} tempId={route.tempId} />
    case 'champ':
      return <OfflineChampMatches key={route.champId} basePath={route.base} champId={route.champId} />
    case 'score':
      return (
        <OfflineScore
          key={`${route.champId}/${route.matchId}`}
          basePath={route.base}
          champId={route.champId}
          matchId={route.matchId}
        />
      )
  }
}

// ── Início / Campeonatos com o que está no aparelho ──────────────────────────
// Mesmas partes das telas online (cabeçalho, filtros, cartões, "Acontecendo
// agora"): offline o app tem a mesma cara, só com o que está guardado aqui.

function useCachedChamps(): CachedChampSummary[] | null {
  const [items, setItems] = useState<CachedChampSummary[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void listCachedChamps()
      .then((list) => {
        if (!cancelled) setItems(list)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [])
  return items
}

function OfflineCampeonatos() {
  const items = useCachedChamps()
  const desafios = (items ?? []).filter((c) => c.format === 'desafio')
  const champs = (items ?? []).filter((c) => c.format !== 'desafio')

  return (
    <div className="px-5 py-4 space-y-6">
      <CampeonatosHeader />

      <PendingList kind="campeonato" />
      <PendingList kind="desafio" />

      {items !== null && (
        <>
          <MyChallengesSection desafios={desafios} />
          <section className="space-y-2">
            <ChampionshipsLabel show={desafios.length > 0} />
            {champs.length === 0 ? (
              <NoChampionships text="Nenhum campeonato guardado neste aparelho." />
            ) : (
              <CampeonatosListClient
                championships={champs.map((c) => ({
                  id: c.id, name: c.name, format: c.format, status: c.status, is_official: c.isOfficial,
                }))}
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}

function OfflineInicio({ name, gender }: { name: string | null; gender: string | null }) {
  const items = useCachedChamps()
  const firstName = (name ?? 'Jogador').trim().split(/\s+/)[0]
  const href = (c: CachedChampSummary) => `${c.format === 'desafio' ? '/desafios' : '/campeonatos'}/${c.id}`
  const open = (items ?? []).filter((c) => c.status !== 'encerrado')

  return (
    <div className="flex flex-col gap-6 pt-2">
      <WelcomeHeader firstName={firstName} gender={gender} />
      <div className="space-y-3 px-5 empty:hidden">
        <PendingList kind="campeonato" />
        <PendingList kind="desafio" />
      </div>
      <OngoingSection
        liveMatches={open.flatMap((c) =>
          c.live.map((m) => ({
            id: m.id,
            href: `${href(c)}/jogos/${m.id}`,
            a: m.a ?? 'A definir',
            b: m.b ?? 'A definir',
            champName: c.name,
          })),
        )}
        active={open.map((c) => ({ id: c.id, name: c.name, isChallenge: c.format === 'desafio', href: href(c) }))}
      />
    </div>
  )
}

// ── Avisos ───────────────────────────────────────────────────────────────────

function ShellMessage({ path }: { path: string }) {
  const isEdit = /\/editar\/?$/.test(path)
  const fallbackHref = path.replace(/\/[^/]*\/?$/, '') || '/'
  return (
    <div className="px-5 py-10">
      <div className="glass glass-card mx-auto max-w-sm space-y-4 px-5 py-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary/12 ring-1 ring-secondary/25">
          <WifiOff className="h-6 w-6 text-secondary/70" />
        </div>
        <h1 className="text-base font-bold text-white">
          {isEdit ? 'Edição indisponível offline' : 'Esta tela precisa de internet'}
        </h1>
        <p className="text-sm leading-relaxed text-white/55">
          {isEdit
            ? 'Para editar é preciso estar conectado.'
            : 'Campeonatos, desafios, jogos e placares continuam funcionando sem conexão.'}
        </p>
        <div className="flex gap-2">
          <OfflineBackButton fallbackHref={fallbackHref} className="flex-1" />
          <Link
            href="/"
            className="flex-1 rounded-2xl border border-white/15 py-3 text-sm font-semibold text-white/75 transition active:scale-95"
          >
            Início
          </Link>
        </div>
      </div>
    </div>
  )
}

/** Sem perfil guardado (nunca entrou logado neste aparelho). */
function StandaloneMessage({ path }: { path: string }) {
  const fallbackHref = path.replace(/\/[^/]*\/?$/, '') || '/'
  return (
    <div
      className="min-h-dvh grid place-items-center px-6 text-center"
      style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #253652 0%, #16233a 100%)' }}
    >
      <div className="max-w-xs space-y-4">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-secondary/12 grid place-items-center ring-1 ring-secondary/25">
          <WifiOff className="h-7 w-7 text-secondary/70" />
        </div>
        <h1 className="text-lg font-bold text-white">Você está offline</h1>
        <p className="text-sm text-white/55 leading-relaxed">
          Entre na sua conta com internet uma vez para usar o app sem conexão.
        </p>
        <OfflineBackButton fallbackHref={fallbackHref} className="w-full" />
      </div>
    </div>
  )
}

/** A rede voltou com o shell aberto: oferece recarregar a versão do servidor. */
function BackOnline() {
  const online = useOnline()
  if (!online) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,var(--top-inset))] z-[60] flex justify-center px-4">
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="glass glass-overlay glass-pill pointer-events-auto flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-secondary shadow-lg"
        style={{ animation: 'reveal-up 0.3s ease-out' }}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Conexão de volta · Atualizar
      </button>
    </div>
  )
}
