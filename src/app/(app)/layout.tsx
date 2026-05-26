import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { TopBar } from '@/components/TopBar'
import { BottomNav } from '@/components/BottomNav'

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()

  // Valida sessão — getUser() bate na API do Supabase Auth (JWT seguro).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Verifica onboarding + papel admin em paralelo
  const [{ data: profile }, { data: adminRole }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, avatar_url, onboarding_completed')
      .eq('id', user.id)
      .single(),
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle(),
  ])

  if (!profile?.onboarding_completed) {
    redirect('/onboarding')
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <TopBar
        name={profile.full_name}
        avatarUrl={profile.avatar_url}
        isAdmin={!!adminRole}
      />
      <main className="flex-1 pb-32">{children}</main>
      <BottomNav />
    </div>
  )
}
