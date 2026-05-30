'use client'

import { useState, useMemo, useTransition } from 'react'
import Image from 'next/image'
import { User, Search, ShieldCheck, GraduationCap, Trash2, X, AlertTriangle } from 'lucide-react'
import { revokeOrganizer, deleteUser } from '@/app/admin/actions'

export type AdminUser = {
  id: string
  name: string | null
  avatarUrl: string | null
  role: 'admin' | 'organizer' | 'jogador'
}

export function AdminUsers({ users, currentUserId }: { users: AdminUser[]; currentUserId: string }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => (u.name ?? '').toLowerCase().includes(q))
  }, [users, query])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl bg-white/[0.06] px-3.5 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-white/35" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar usuário por nome…"
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')}>
            <X className="h-4 w-4 text-white/35" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="glass glass-card px-4 py-8 text-center text-sm text-white/40">
          Nenhum usuário encontrado.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((u) => (
            <UserRow key={u.id} user={u} isSelf={u.id === currentUserId} />
          ))}
        </ul>
      )}
    </div>
  )
}

function RoleBadge({ role }: { role: AdminUser['role'] }) {
  if (role === 'admin') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-secondary/15 px-2 py-0.5 text-[10px] font-bold text-secondary">
        <ShieldCheck className="h-3 w-3" /> Admin
      </span>
    )
  }
  if (role === 'organizer') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
        <GraduationCap className="h-3 w-3" /> Professor
      </span>
    )
  }
  return <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/40">Jogador</span>
}

function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removed, setRemoved] = useState(false)
  const [role, setRole] = useState(user.role)

  if (removed) return null

  function handleRevoke() {
    setError(null)
    startTransition(async () => {
      const r = await revokeOrganizer(user.id)
      if (r.error) { setError(r.error); return }
      setRole('jogador')
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const r = await deleteUser(user.id)
      if (r.error) { setError(r.error); setConfirming(false); return }
      setRemoved(true)
    })
  }

  return (
    <li className="glass glass-card p-3">
      <div className="flex items-center gap-3">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/15">
          {user.avatarUrl ? (
            <Image src={user.avatarUrl} alt={user.name ?? ''} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white/8">
              <User className="h-5 w-5 text-white/40" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{user.name ?? 'Usuário'}</p>
          <div className="mt-0.5"><RoleBadge role={role} /></div>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {!isSelf && role !== 'admin' && (
        <>
          {confirming ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-start gap-2 text-xs text-white/75">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                <span>Excluir <b>{user.name ?? 'este usuário'}</b> definitivamente? Apaga conta, perfil e participações.</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleDelete}
                  className="flex-1 rounded-xl bg-red-500/90 py-2 text-xs font-bold text-white transition active:scale-95 disabled:opacity-50"
                >
                  {pending ? 'Excluindo…' : 'Sim, excluir'}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-xl bg-white/[0.06] py-2 text-xs font-semibold text-white/70 transition active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              {role === 'organizer' && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleRevoke}
                  className="flex items-center gap-1.5 rounded-xl border border-white/12 px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/8 active:scale-95 disabled:opacity-50"
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  Remover professor
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirming(true)}
                className="flex items-center gap-1.5 rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 active:scale-95 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </button>
            </div>
          )}
        </>
      )}
    </li>
  )
}
