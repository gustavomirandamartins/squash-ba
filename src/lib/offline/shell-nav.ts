// Navegação dentro do shell offline (OfflineAppShell).
//
// O shell é uma página só (servida pelo service worker no lugar da tela pedida)
// que desenha a tela a partir da URL. Entre as telas que ele conhece, navegar é
// trocar a URL (history.pushState — o roteador do Next acompanha e atualiza o
// usePathname), sem ir ao servidor nem recarregar.

// ── Rotas que o shell desenha com dados do aparelho ─────────────────────────

export type Base = '/campeonatos' | '/desafios'

export type ShellRoute =
  | { kind: 'home'; filter: 'all' | 'campeonato' | 'desafio' }
  | { kind: 'champ-new' }
  | { kind: 'desafio-new' }
  | { kind: 'sync' }
  | { kind: 'provisional'; tempId: string }
  | { kind: 'champ'; base: Base; champId: string }
  | { kind: 'score'; base: Base; champId: string; matchId: string }

const dec = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function shellRoute(pathname: string): ShellRoute | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/' || path === '/~offline') return { kind: 'home', filter: 'all' }
  if (path === '/campeonatos') return { kind: 'home', filter: 'campeonato' }
  if (path === '/desafios') return { kind: 'home', filter: 'desafio' }
  if (path === '/campeonatos/novo') return { kind: 'champ-new' }
  if (path === '/desafios/novo') return { kind: 'desafio-new' }
  if (path === '/sincronizacao') return { kind: 'sync' }
  const pend = path.match(/^\/pendentes\/([^/]+)$/)
  if (pend) return { kind: 'provisional', tempId: dec(pend[1]) }
  const score = path.match(/^\/(campeonatos|desafios)\/([^/]+)\/jogos\/([^/]+)$/)
  if (score) return { kind: 'score', base: `/${score[1]}` as Base, champId: dec(score[2]), matchId: dec(score[3]) }
  const champ = path.match(/^\/(campeonatos|desafios)\/([^/]+)$/)
  if (champ) return { kind: 'champ', base: `/${champ[1]}` as Base, champId: dec(champ[2]) }
  return null
}

let active = false

/** Chamado pelo shell ao montar/desmontar. */
export function setShellActive(v: boolean): void {
  active = v
}

export function isShellActive(): boolean {
  return active
}

/**
 * Com o shell ativo e uma tela que ele sabe desenhar, troca só a URL e
 * retorna true. Senão retorna false (use o roteador normal). Início e listas
 * só sem rede: com rede, a versão do servidor é melhor.
 */
export function shellNavigate(href: string, replace = false): boolean {
  if (!active || typeof window === 'undefined') return false
  const url = new URL(href, window.location.href)
  if (url.origin !== window.location.origin) return false
  const route = shellRoute(url.pathname)
  if (!route || (route.kind === 'home' && navigator.onLine)) return false
  const next = url.pathname + url.search + url.hash
  if (replace) window.history.replaceState(null, '', next)
  else if (next !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.pushState(null, '', next)
  }
  return true
}
