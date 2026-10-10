import { createClient, getAuthUser } from '@/utils/supabase/server'
import { Users } from 'lucide-react'
import { AdminUsers, type AdminUser } from '@/components/admin/AdminUsers'

export const metadata = { title: 'Usuários — Admin' }

export default async function AdminUsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>
}) {
  const { u } = await searchParams
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return null

  const [{ data: allProfiles }, { data: allRoles }, { data: allEmails }] =
    await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url').order('full_name'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('profiles_private').select('user_id, email'),
    ])

  const rolesByUser = new Map<string, Set<string>>()
  for (const r of (allRoles ?? []) as Array<{ user_id: string; role: string }>) {
    const set = rolesByUser.get(r.user_id) ?? new Set<string>()
    set.add(r.role)
    rolesByUser.set(r.user_id, set)
  }

  const emailByUser = new Map<string, string | null>()
  for (const e of (allEmails ?? []) as Array<{ user_id: string; email: string | null }>) {
    emailByUser.set(e.user_id, e.email)
  }

  const users: AdminUser[] = (
    allProfiles ?? []
  ).map(
    (p: { id: string; full_name: string | null; avatar_url: string | null }) => {
      const roles = rolesByUser.get(p.id)
      const role: AdminUser['role'] = roles?.has('admin')
        ? 'admin'
        : roles?.has('organizer')
          ? 'organizer'
          : 'jogador'
      return {
        id: p.id,
        name: p.full_name,
        email: emailByUser.get(p.id) ?? null,
        avatarUrl: p.avatar_url,
        role,
      }
    },
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-white/40" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/40">
          Usuários cadastrados
        </h2>
        <span className="ml-auto text-[11px] text-white/30">{users.length}</span>
      </div>
      <p className="text-xs text-white/35">
        Remova o acesso de professor ou exclua usuários cadastrados.
      </p>
      <AdminUsers users={users} currentUserId={user.id} initialQuery={u ?? ''} />
    </div>
  )
}
