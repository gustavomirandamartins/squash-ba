'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

/**
 * Botão "Enviar mensagem" da ficha do jogador — abre (ou cria) a conversa direta.
 */
export function MessageButton({ userId }: { userId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open() {
    if (busy) return
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
      _other_user_id: userId,
    })
    if (error || !data) {
      setBusy(false)
      // Bloqueio (em qualquer sentido): o banco recusa com mensagem própria.
      setError(
        error?.message === 'Não é possível conversar com este usuário.'
          ? error.message
          : 'Não foi possível abrir a conversa.',
      )
      return
    }
    router.push(`/mensagens/${data as string}`)
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-secondary py-3 text-sm font-bold text-primary transition active:scale-95 disabled:opacity-50"
      >
        <MessageSquare className="h-4 w-4" />
        {busy ? 'Abrindo…' : 'Enviar mensagem'}
      </button>
      {error && <p className="text-center text-xs text-red-400">{error}</p>}
    </div>
  )
}
