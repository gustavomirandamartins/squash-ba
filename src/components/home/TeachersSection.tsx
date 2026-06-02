'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { GraduationCap, MessageSquare, User } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

export interface Teacher {
  id: string
  full_name: string | null
  avatar_url: string | null
}

export function TeachersSection({ teachers, currentUserId }: { teachers: Teacher[]; currentUserId?: string }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [busy, setBusy] = useState<string | null>(null)

  if (teachers.length === 0) return null

  async function contact(userId: string) {
    if (busy) return
    setBusy(userId)
    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
      _other_user_id: userId,
    })
    setBusy(null)
    if (!error && data) router.push(`/mensagens/${data as string}`)
  }

  return (
    <section className="px-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-white">
        <GraduationCap className="h-5 w-5 text-secondary" />
        Professores
      </h2>
      <div className="space-y-1.5">
        {teachers.map((t) => (
          <div key={t.id} className="glass glass-card flex items-center gap-3 px-3.5 py-3">
            {t.avatar_url ? (
              <Image
                src={t.avatar_url}
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white/10"
              />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary/15">
                <User className="h-5 w-5 text-secondary" />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/85">
              {t.full_name ?? 'Professor'}
            </span>
            {t.id === currentUserId ? (
              <span className="shrink-0 rounded-full bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/40">
                Você
              </span>
            ) : (
              <button
                type="button"
                disabled={busy === t.id}
                onClick={() => void contact(t.id)}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary/15 px-3 py-1.5 text-xs font-semibold text-secondary transition active:scale-95 disabled:opacity-50"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {busy === t.id ? 'Abrindo…' : 'Contato'}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
