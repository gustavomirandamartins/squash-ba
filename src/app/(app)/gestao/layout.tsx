import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
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

  const { data: rolesData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)

  const roleSet = new Set((rolesData ?? []).map((r) => r.role as string))
  const isAdmin   = roleSet.has('admin')
  const canManage = roleSet.has('organizer') || isAdmin

  if (!canManage) notFound()

  return (
    <>
      <GestaoNav isAdmin={isAdmin} />
      {children}
    </>
  )
}
