'use client'

/** Ficha do jogador: menu Denunciar/Bloquear e o desbloqueio. */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { unblockUser } from '@/lib/moderation'
import { ModerationMenu } from '@/components/moderation/ModerationMenu'

export function PlayerMenu({ meId, playerId, playerName }: { meId: string; playerId: string; playerName: string | null }) {
  const router = useRouter()
  return (
    <ModerationMenu
      meId={meId}
      targetType="profile"
      targetId={playerId}
      ownerId={playerId}
      ownerName={playerName}
      onBlocked={() => router.refresh()}
    />
  )
}

export function BlockedNotice({ meId, playerId }: { meId: string; playerId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function unblock() {
    setBusy(true)
    setError(null)
    const { error } = await unblockUser(createClient(), meId, playerId)
    setBusy(false)
    if (error) setError('Não foi possível desbloquear. Tente de novo.')
    else router.refresh()
  }

  return (
    <div className="glass glass-card space-y-3 px-4 py-4 text-center">
      <p className="flex items-center justify-center gap-2 text-sm text-white/70">
        <Ban className="h-4 w-4 text-red-400/80" />
        Você bloqueou este jogador.
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void unblock()}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-white/8 px-5 py-2 text-sm font-semibold text-white/75 transition active:scale-95 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Desbloquear
      </button>
    </div>
  )
}
