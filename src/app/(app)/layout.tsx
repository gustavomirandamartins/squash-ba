import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { TopBar } from '@/components/TopBar'
import { BottomNav } from '@/components/BottomNav'
import { DesktopSidebar } from '@/components/DesktopSidebar'
import { OfflineSync } from '@/components/offline/OfflineSync'
import { OfflinePreloader } from '@/components/offline/OfflinePreloader'
import { UpdateBanner } from '@/components/offline/UpdateBanner'

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
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden landscape-sm:max-w-none lg:max-w-none lg:flex-row">
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
          userId={user.id}
        />
        <main className="flex flex-1 flex-col overflow-y-auto overscroll-y-contain pb-32 landscape-sm:pb-8 landscape-sm:pl-[max(4.75rem,calc(env(safe-area-inset-left)+4rem))] landscape-sm:pr-[max(0.5rem,env(safe-area-inset-right))] lg:mx-auto lg:w-full lg:max-w-3xl lg:px-2 lg:pb-16 lg:pl-2">
          {children}
        </main>
      </div>

      <BottomNav userId={user.id} />
      <OfflineSync />
      <OfflinePreloader />
      <UpdateBanner />
    </div>
  )
}
