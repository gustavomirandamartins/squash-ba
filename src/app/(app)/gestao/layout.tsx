import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getUserRoles } from '@/utils/get-user-roles'
import { GestaoNav } from '@/components/GestaoNav'

export const metadata = { title: 'Gestão' }

export default async function GestaoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) notFound()

  const { canManage } = await getUserRoles(user.id)
  if (!canManage) notFound()

  return (
    <>
      <GestaoNav />
      {children}
    </>
  )
}
