import { createClient } from '@/utils/supabase/server'
import { ChallengeWizard } from '@/components/desafios/ChallengeWizard'

export const metadata = { title: 'Novo desafio' }

export default async function NovoDesafioPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { name } = await searchParams
  const initialName = (name ?? '').trim()

  return <ChallengeWizard currentUserId={user.id} initialName={initialName} />
}
