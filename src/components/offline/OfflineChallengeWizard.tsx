'use client'

// /desafios/novo no shell offline: o wizard precisa do usuário atual, que aqui
// vem da sessão gravada no aparelho (não há servidor para perguntar).

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { ChallengeWizard } from '@/components/desafios/ChallengeWizard'

export function OfflineChallengeWizard() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    void createClient()
      .auth.getSession()
      .then(({ data }) => setUserId(data.session?.user.id ?? null))
      .catch(() => setUserId(null))
  }, [])

  if (userId === undefined) return null
  if (!userId) {
    return (
      <p className="px-6 py-10 text-center text-sm text-white/55">
        Entre na sua conta com internet uma vez para criar desafios offline.
      </p>
    )
  }
  return <ChallengeWizard currentUserId={userId} />
}
