'use client'

import { useState, useEffect, useId } from 'react'
import { createClient } from '@/utils/supabase/client'

/**
 * Total de mensagens não-lidas do usuário, com atualização via Realtime + foco.
 * Compartilhado entre a BottomNav (mobile) e a DesktopSidebar.
 */
export function useUnreadCount(userId: string | null) {
  const [count, setCount] = useState(0)
  const [supabase] = useState(() => createClient())
  // Nome de canal único por instância — evita colisão quando BottomNav e
  // DesktopSidebar montam juntos (a sidebar fica `hidden` no mobile mas monta).
  const instanceId = useId()

  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function fetchCount() {
      if (!userId) { setCount(0); return }
      const { data: memberships } = await supabase
        .from('conversation_members')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId)

      if (!memberships?.length) { if (!cancelled) setCount(0); return }

      let total = 0
      await Promise.all(
        memberships.map(async (m: { conversation_id: string; last_read_at: string | null }) => {
          const since = m.last_read_at ?? new Date(0).toISOString()
          const { count: c } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', m.conversation_id)
            .neq('sender_id', userId)
            .gt('created_at', since)
          total += c ?? 0
        }),
      )
      if (!cancelled) setCount(total)
    }

    void fetchCount()

    async function setup() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token)
      if (cancelled) return
      channel = supabase
        .channel(`unread-${userId ?? 'anon'}-${instanceId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
          void fetchCount()
        })
        .subscribe()
    }
    void setup()

    const onFocus = () => void fetchCount()
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
      window.removeEventListener('focus', onFocus)
    }
  }, [userId, supabase, instanceId])

  return count
}
