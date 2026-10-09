'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Logo } from './Logo'
import { UserAvatarMenu } from './UserAvatarMenu'
import { SearchDropdown } from './SearchDropdown'
import { NotificationsBell } from './NotificationsBell'
import { useIsDesktop } from '@/lib/use-is-desktop'

/** Onde o OfflineSync põe o chip de status (Offline / Sincronizando…). */
export const SYNC_SLOT_ID = 'sync-status-slot'

interface Props {
  name?: string | null
  avatarUrl?: string | null
  isAdmin?: boolean
  canManage?: boolean
  userId?: string | null
}

export function TopBar({ name, avatarUrl, isAdmin, canManage, userId }: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  // No desktop o sino fica na DesktopSidebar — não monta um segundo aqui.
  const isDesktop = useIsDesktop() === true

  return (
    <header className="relative z-30 shrink-0">
      {/*
        Grid layout — grid-template-columns IS animatable in CSS, so we get
        a smooth simultaneous collapse (logo) + expand (search) transition.

        Normal:  [logo: auto] [spacer: 1fr] [search: 40px] [gap: 10px] [avatar: auto]
        Search:  [logo: 0px]  [spacer: 0fr] [search: 1fr]  [gap: 10px] [avatar: auto]
      */}
      <div
        className="relative grid items-center px-5 pb-3 pt-[max(1rem,var(--top-inset))]"
        style={{
          gridTemplateColumns: searchOpen
            ? '0px 0fr 1fr 10px auto'
            : 'auto 1fr 40px 10px auto',
          transition: 'grid-template-columns 280ms cubic-bezier(.4,0,.2,1)',
        }}
      >
        {/* Col 1 — Logo + badge de versão (collapses to 0 when search opens).
            No desktop o conteúdo é ocultado (logo está no rail), mas a CÉLULA do
            grid permanece — senão o auto-flow desloca a busca para a coluna 0fr. */}
        <div className="overflow-hidden">
          <div
            className="flex items-center gap-2 transition-opacity duration-200 lg:hidden"
            style={{ opacity: searchOpen ? 0 : 1 }}
          >
            <Link href="/" aria-label="Ir para a página inicial" className="inline-flex">
              <Logo />
            </Link>
            <Link
              href="/versao"
              className="whitespace-nowrap text-[10px] font-medium text-white/25 transition hover:text-white/50"
            >
              Beta {process.env.NEXT_PUBLIC_VERSION ?? '?'}
            </Link>
          </div>
        </div>

        {/* Col 2 — Spacer (shrinks to 0fr) */}
        <div />

        {/* Col 3 — Busca (botão → barra → resultados) */}
        <SearchDropdown
          open={searchOpen}
          onOpen={() => setSearchOpen(true)}
          onClose={() => setSearchOpen(false)}
        />

        {/* Col 4 — gap (handled by grid column width) */}
        <div />

        {/* Col 5 — Avatar menu (no desktop fica no rail → conteúdo oculto, mas a
            célula do grid permanece p/ não deslocar a busca). */}
        <div>
          <div className="flex items-center gap-2 lg:hidden">
            {!isDesktop && <NotificationsBell userId={userId ?? null} />}
            <UserAvatarMenu
              name={name}
              avatarUrl={avatarUrl}
              isAdmin={isAdmin}
              canManage={canManage}
            />
          </div>
        </div>
      </div>

      {/* Chip de sincronização logo abaixo do logo (o OfflineSync o coloca
          aqui). Vazio quando online e sem fila → não ocupa espaço. */}
      <div id={SYNC_SLOT_ID} className="-mt-1 px-5 pb-2 empty:hidden" />
    </header>
  )
}
