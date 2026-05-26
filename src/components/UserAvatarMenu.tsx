'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { LogOut, User, Settings } from 'lucide-react'

interface Props {
  name?: string | null
  avatarUrl?: string | null
}

export function UserAvatarMenu({ name, avatarUrl }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label="Menu do usuário"
        onClick={() => setOpen((v) => !v)}
        className="h-10 w-10 overflow-hidden rounded-full border border-white/15 transition active:scale-95"
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={name ?? 'Avatar'}
            width={40}
            height={40}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/8">
            <User className="h-5 w-5 text-white/50" />
          </div>
        )}
      </button>

      {open && (
        <div
          className="glass glass-card absolute right-0 top-12 z-50 min-w-[160px] overflow-hidden p-1"
          style={{ borderRadius: 16 }}
        >
          {name && (
            <div className="px-3 py-2 text-sm font-medium text-white/85 truncate max-w-[180px]">
              {name}
            </div>
          )}
          {name && <div className="h-px bg-white/8 mx-2" />}
          <Link
            href="/perfil"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/8 hover:text-white active:scale-95"
          >
            <Settings className="h-4 w-4" />
            Editar perfil
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/8 hover:text-white active:scale-95"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      )}
    </div>
  )
}
