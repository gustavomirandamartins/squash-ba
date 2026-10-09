// Perfil do usuário guardado no aparelho para o shell offline montar a mesma
// moldura do app (TopBar, navegação, avatar) sem falar com o servidor.
//
// localStorage (leitura síncrona: o shell decide o que desenhar no primeiro
// render). Gravado pelo layout (app) a cada abertura online; apagado ao sair.

import type { FrameProfile } from '@/components/AppFrame'

const KEY = 'sb-shell-profile'
export const SHELL_PROFILE_EVENT = 'sb-shell-profile-changed'

export type ShellProfile = FrameProfile & { savedAt: number }

/** JSON cru (estável entre chamadas → serve de snapshot p/ useSyncExternalStore). */
export function readShellProfileRaw(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function parseShellProfile(raw: string | null): ShellProfile | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as ShellProfile
    return p && typeof p.userId === 'string' ? p : null
  } catch {
    return null
  }
}

export function saveShellProfile(p: FrameProfile): void {
  try {
    const prev = parseShellProfile(readShellProfileRaw())
    const same =
      prev &&
      prev.userId === p.userId &&
      prev.name === p.name &&
      prev.avatarUrl === p.avatarUrl &&
      prev.isAdmin === p.isAdmin &&
      prev.canManage === p.canManage &&
      (prev.gender ?? null) === (p.gender ?? null)
    if (same) return
    localStorage.setItem(KEY, JSON.stringify({ ...p, savedAt: Date.now() }))
    window.dispatchEvent(new Event(SHELL_PROFILE_EVENT))
  } catch {
    /* modo privado / sem espaço: o shell cai no aviso simples */
  }
}

export function clearShellProfile(): void {
  try {
    localStorage.removeItem(KEY)
    window.dispatchEvent(new Event(SHELL_PROFILE_EVENT))
  } catch {
    /* ignore */
  }
}

export function subscribeShellProfile(cb: () => void): () => void {
  window.addEventListener(SHELL_PROFILE_EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(SHELL_PROFILE_EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}
