import { redirect } from 'next/navigation'
import { createClient, getAuthUser } from '@/utils/supabase/server'
import { AppFrame } from '@/components/AppFrame'
import { OfflineSync } from '@/components/offline/OfflineSync'
import { OfflinePreloader } from '@/components/offline/OfflinePreloader'
import { UpdateBanner } from '@/components/offline/UpdateBanner'
import { ShellProfileSaver } from '@/components/offline/ShellProfileSaver'

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Um único client por request — evita inconsistência de sessão entre instâncias.
  const supabase = await createClient()

  const user = await getAuthUser()

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

  const frameProfile = {
    userId: user.id,
    name: profile.full_name,
    avatarUrl: profile.avatar_url,
    isAdmin,
    canManage,
  }

  return (
    <AppFrame
      profile={frameProfile}
      extras={
        <>
          <OfflineSync />
          <OfflinePreloader />
          <UpdateBanner />
          {/* o shell offline monta esta mesma moldura com o perfil guardado */}
          <ShellProfileSaver profile={frameProfile} />
        </>
      }
    >
      {children}
    </AppFrame>
  )
}
