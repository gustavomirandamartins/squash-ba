// Moldura do app: rail (desktop), TopBar, <main> com o conteúdo e BottomNav.
//
// Compartilhada entre o layout (app) — renderizado no servidor com o perfil do
// banco — e o shell offline (/~offline), que a monta no aparelho com o perfil
// guardado (shell-profile). Assim, sem sinal, o app continua com a mesma cara e
// a mesma navegação. Sem 'use client': é server component no layout e client
// component no shell.

import type { ReactNode } from 'react'
import { TopBar } from '@/components/TopBar'
import { BottomNav } from '@/components/BottomNav'
import { DesktopSidebar } from '@/components/DesktopSidebar'

export type FrameProfile = {
  userId: string
  name: string | null
  avatarUrl: string | null
  isAdmin: boolean
  canManage: boolean
}

export function AppFrame({
  profile,
  children,
  extras,
}: {
  profile: FrameProfile
  children: ReactNode
  /** ilhas sem layout próprio (sync, pré-carga, avisos) */
  extras?: ReactNode
}) {
  const { userId, name, avatarUrl, isAdmin, canManage } = profile
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden landscape-sm:max-w-none lg:max-w-none lg:flex-row">
      {/* Rail de navegação (apenas desktop) */}
      <DesktopSidebar name={name} avatarUrl={avatarUrl} isAdmin={isAdmin} canManage={canManage} userId={userId} />

      {/*
        Wrapper do conteúdo. No mobile usa `display:contents` → TopBar e <main>
        comportam-se como filhos diretos da coluna de 480px (layout mobile
        INALTERADO). No desktop (lg) vira a coluna de conteúdo ao lado do rail.
      */}
      <div className="contents lg:flex lg:min-h-dvh lg:min-w-0 lg:flex-1 lg:flex-col">
        <TopBar name={name} avatarUrl={avatarUrl} isAdmin={isAdmin} canManage={canManage} userId={userId} />
        <main className="flex flex-1 flex-col overflow-y-auto overscroll-y-contain pb-32 landscape-sm:pb-8 landscape-sm:pl-[max(4.75rem,calc(env(safe-area-inset-left)+4rem))] landscape-sm:pr-[max(0.5rem,env(safe-area-inset-right))] lg:mx-auto lg:w-full lg:max-w-3xl lg:px-2 lg:pb-16 lg:pl-2">
          {children}
        </main>
      </div>

      <BottomNav userId={userId} />
      {extras}
    </div>
  )
}
