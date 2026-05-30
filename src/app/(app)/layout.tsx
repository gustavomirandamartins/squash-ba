import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { TopBar } from '@/components/TopBar'
import { BottomNav } from '@/components/BottomNav'
import { DesktopSidebar } from '@/components/DesktopSidebar'

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
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col lg:max-w-none lg:flex-row">
      {/* Rail de navegação (apenas desktop) */}
      <DesktopSidebar
        name={profile.full_name}
        avatarUrl={profile.avatar_url}
        isAdmin={isAdmin}
        canManage={canManage}
        userId={user.id}
      />

      {/*
        Wrapper do conteúdo. No mobile usa `display:contents` → TopBar e <main>
        comportam-se como filhos diretos da coluna de 480px (layout mobile
        INALTERADO). No desktop (lg) vira a coluna de conteúdo ao lado do rail.
      */}
      <div className="contents lg:flex lg:min-h-dvh lg:min-w-0 lg:flex-1 lg:flex-col">
        <TopBar
          name={profile.full_name}
          avatarUrl={profile.avatar_url}
          isAdmin={isAdmin}
          canManage={canManage}
        />
        <main className="flex flex-1 flex-col pb-32 lg:mx-auto lg:w-full lg:max-w-3xl lg:px-2 lg:pb-16">
          {children}
        </main>
      </div>

      <BottomNav userId={user.id} />
    </div>
  )
}
