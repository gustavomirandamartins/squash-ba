import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { TopBar } from '@/components/TopBar'
import { BottomNav } from '@/components/BottomNav'

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Um único client por request — evita inconsistência de sessão entre instâncias.
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Perfil + papéis com o MESMO client (mesmo cookie store / sessão).
  const [{ data: profile }, { data: rolesData }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, avatar_url, onboarding_completed')
      .eq('id', user.id)
      .single(),
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id),
  ])

  if (!profile?.onboarding_completed) redirect('/onboarding')

  const roleSet = new Set((rolesData ?? []).map((r) => r.role as string))
  const isAdmin = roleSet.has('admin')
  const canManage = roleSet.has('organizer') || roleSet.has('admin')

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <TopBar
        name={profile.full_name}
        avatarUrl={profile.avatar_url}
        isAdmin={isAdmin}
        canManage={canManage}
      />
      <main className="flex-1 pb-32">{children}</main>
      <BottomNav />
    </div>
  )
}
