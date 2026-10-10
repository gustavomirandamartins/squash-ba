'use client'

/** Usuários que eu bloqueei, com desbloqueio. */

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Ban, Loader2, User } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { unblockUser } from '@/lib/moderation'

type Blocked = { id: string; name: string | null; avatar: string | null }

type Row = {
  blocked_id: string
  profiles: { full_name: string | null; avatar_url: string | null } | { full_name: string | null; avatar_url: string | null }[] | null
}

export function BlockedUsersSection({ userId }: { userId: string }) {
  const [list, setList] = useState<Blocked[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void createClient()
      .from('user_blocks')
      .select('blocked_id, profiles!user_blocks_blocked_id_fkey(full_name, avatar_url)')
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        setList(
          ((data ?? []) as unknown as Row[]).map((r) => {
            const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
            return { id: r.blocked_id, name: p?.full_name ?? null, avatar: p?.avatar_url ?? null }
          }),
        )
      })
    return () => { cancelled = true }
  }, [userId])

  async function unblock(id: string) {
    setBusyId(id)
    setError(null)
    const { error } = await unblockUser(createClient(), userId, id)
    setBusyId(null)
    if (error) setError('Não foi possível desbloquear. Tente de novo.')
    else setList((prev) => (prev ?? []).filter((b) => b.id !== id))
  }

  return (
    <div className="glass glass-card mt-6 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Ban className="h-4 w-4 text-secondary/80" />
        <h2 className="font-display text-sm font-bold text-white">Usuários bloqueados</h2>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-white/50">
        Vocês não veem os posts e comentários um do outro e não trocam mensagens diretas.
      </p>

      {list === null ? (
        <p className="flex items-center gap-2 text-xs text-white/35">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </p>
      ) : list.length === 0 ? (
        <p className="text-xs text-white/35">Você não bloqueou ninguém.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5">
              {b.avatar ? (
                <Image src={b.avatar} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.08]">
                  <User className="h-4 w-4 text-white/40" />
                </div>
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-white/80">{b.name ?? 'Jogador'}</span>
              <button
                type="button"
                disabled={busyId === b.id}
                onClick={() => void unblock(b.id)}
                className="flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/70 transition active:scale-95 disabled:opacity-50"
              >
                {busyId === b.id && <Loader2 className="h-3 w-3 animate-spin" />}
                Desbloquear
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  )
}
