'use client'

import { useState, useEffect, useId } from 'react'
import { createClient } from '@/utils/supabase/client'
import { onAppReturn } from '@/lib/on-app-return'

/**
 * Total de mensagens não-lidas do usuário, com atualização via Realtime e ao
 * voltar ao app (no máximo a cada 30 s). Compartilhado entre a BottomNav
 * (mobile) e a DesktopSidebar.
 *
 * Uma chamada só (RPC get_unread_total, contada no banco) — antes era uma
 * consulta por conversa a cada atualização.
 */
export function useUnreadCount(userId: string | null) {
  const [count, setCount] = useState(0)
  const [supabase] = useState(() => createClient())
  // Nome de canal único por instância — evita colisão quando BottomNav e
  // DesktopSidebar montam juntos (a sidebar fica `hidden` no mobile mas monta).
  const instanceId = useId()

  useEffect(() => {
    // Sem usuário (ou instância desligada): nada de consulta nem canal.
    if (!userId) return
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    let debounce: ReturnType<typeof setTimeout> | undefined

    async function fetchCount() {
      const { data, error } = await supabase.rpc('get_unread_total')
      if (!cancelled && !error) setCount((data as number | null) ?? 0)
    }

    void fetchCount()

    // Várias mensagens chegando juntas → uma recarga.
    const refetchSoon = () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void fetchCount(), 800)
    }

    async function setup() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token)
      if (cancelled) return
      channel = supabase
        .channel(`unread-${userId ?? 'anon'}-${instanceId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refetchSoon)
        .subscribe()
    }
    void setup()

    const stopReturn = onAppReturn(() => void fetchCount())

    return () => {
      cancelled = true
      clearTimeout(debounce)
      if (channel) void supabase.removeChannel(channel)
      stopReturn()
    }
  }, [userId, supabase, instanceId])

  return userId ? count : 0
}
