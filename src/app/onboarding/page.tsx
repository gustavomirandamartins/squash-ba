import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { OnboardingForm } from './OnboardingForm'

export default async function OnboardingPage() {
  const supabase = await createClient()

  // Valida sessão no servidor — getUser() garante JWT válido (nunca getSession())
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Se já completou, manda pro app
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed) {
    redirect('/')
  }

  // Busca e-mail de profiles_private (preenchido pelo trigger)
  const { data: priv } = await supabase
    .from('profiles_private')
    .select('email')
    .eq('user_id', user.id)
    .single()

  return (
    <OnboardingForm
      userId={user.id}
      email={priv?.email ?? user.email ?? ''}
    />
  )
}
