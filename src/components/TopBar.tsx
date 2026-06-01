'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Logo } from './Logo'
import { UserAvatarMenu } from './UserAvatarMenu'
import { SearchDropdown } from './SearchDropdown'

interface Props {
  name?: string | null
  avatarUrl?: string | null
  isAdmin?: boolean
  canManage?: boolean
}

export function TopBar({ name, avatarUrl, isAdmin, canManage }: Props) {
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30">
      {/*
        Gradient glassmorphism background:
        top → full blur + semi-transparent dark (glass effect)
        bottom → fully transparent (page content shows through)
        mask-image fades the backdrop-filter + background together.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'rgba(29, 43, 69, 0.80)',
          backdropFilter: 'blur(20px) saturate(130%)',
          WebkitBackdropFilter: 'blur(20px) saturate(130%)',
          maskImage: 'linear-gradient(to bottom, black 45%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, black 45%, transparent 100%)',
        }}
      />

      {/*
        Grid layout — grid-template-columns IS animatable in CSS, so we get
        a smooth simultaneous collapse (logo) + expand (search) transition.

        Normal:  [logo: auto] [spacer: 1fr] [search: 40px] [gap: 10px] [avatar: auto]
        Search:  [logo: 0px]  [spacer: 0fr] [search: 1fr]  [gap: 10px] [avatar: auto]
      */}
      <div
        className="relative grid items-center px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]"
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
              Beta 0.{process.env.NEXT_PUBLIC_COMMIT_COUNT ?? '?'}
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
          <div className="lg:hidden">
            <UserAvatarMenu
              name={name}
              avatarUrl={avatarUrl}
              isAdmin={isAdmin}
              canManage={canManage}
            />
          </div>
        </div>
      </div>
    </header>
  )
}
