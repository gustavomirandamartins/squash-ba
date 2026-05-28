import { createClient } from '@/utils/supabase/server'
import { ChallengeWizard } from '@/components/desafios/ChallengeWizard'

export const metadata = { title: 'Novo desafio' }

export default async function NovoDesafioPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // layout.tsx já redireciona para /login se não autenticado
  // mas garantimos que user.id está disponível
  if (!user) return null

  return <ChallengeWizard currentUserId={user.id} />
}
