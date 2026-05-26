'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { Logo } from './Logo'
import { UserAvatarMenu } from './UserAvatarMenu'

interface Props {
  name?: string | null
  avatarUrl?: string | null
  isAdmin?: boolean
  canManage?: boolean
}

export function TopBar({ name, avatarUrl, isAdmin, canManage }: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input after the expand animation starts
  useEffect(() => {
    if (searchOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
  }, [searchOpen])

  function closeSearch() {
    setSearchOpen(false)
    setQuery('')
  }

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
        {/* Col 1 — Logo (collapses to 0 when search opens) */}
        <div className="overflow-hidden">
          <div
            className="transition-opacity duration-200"
            style={{ opacity: searchOpen ? 0 : 1 }}
          >
            <Logo />
          </div>
        </div>

        {/* Col 2 — Spacer (shrinks to 0fr) */}
        <div />

        {/* Col 3 — Search button / expanded input */}
        <div className="relative h-10 overflow-hidden">
          {/* Round icon button (default) */}
          <button
            type="button"
            aria-label="Buscar"
            onClick={() => setSearchOpen(true)}
            className="absolute inset-0 grid place-items-center rounded-full glass text-white/85 transition-all duration-200 active:scale-95"
            style={{
              opacity: searchOpen ? 0 : 1,
              pointerEvents: searchOpen ? 'none' : 'auto',
              transform: searchOpen ? 'scale(0.8)' : 'scale(1)',
            }}
          >
            <Search className="h-[18px] w-[18px]" />
          </button>

          {/* Expanded search bar */}
          <div
            className="glass absolute inset-0 flex items-center gap-2 rounded-full px-3 transition-all duration-200"
            style={{
              opacity: searchOpen ? 1 : 0,
              pointerEvents: searchOpen ? 'auto' : 'none',
            }}
          >
            <Search className="h-4 w-4 shrink-0 text-white/45" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
              placeholder="Buscar…"
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/35 outline-none"
            />
            <button
              type="button"
              aria-label="Fechar busca"
              onClick={closeSearch}
              className="shrink-0 transition active:scale-95"
            >
              <X className="h-4 w-4 text-white/45" />
            </button>
          </div>
        </div>

        {/* Col 4 — gap (handled by grid column width) */}
        <div />

        {/* Col 5 — Avatar menu */}
        <UserAvatarMenu
          name={name}
          avatarUrl={avatarUrl}
          isAdmin={isAdmin}
          canManage={canManage}
        />
      </div>
    </header>
  )
}
