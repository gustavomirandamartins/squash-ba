import { Users } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { ComunidadeClient, type CommunityUser } from '@/components/comunidade/ComunidadeClient'

export const metadata = { title: 'Comunidade' }

export default async function ComunidadePage() {
  const supabase = await createClient()

  // Dados públicos de todos os jogadores que concluíram o onboarding.
  const [{ data: profiles }, { data: categories }, { data: teams }, { data: roles }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, avatar_url, category_id, team_id')
        .eq('onboarding_completed', true)
        .not('full_name', 'is', null)
        .order('full_name', { ascending: true }),
      supabase.from('categories').select('id, name'),
      supabase.from('teams').select('id, name'),
      supabase.from('user_roles').select('user_id, role').eq('role', 'organizer'),
    ])

  const catMap = new Map((categories ?? []).map((c) => [c.id, c.name]))
  const teamMap = new Map((teams ?? []).map((t) => [t.id, t.name]))
  const professorIds = new Set(
    (roles ?? []).map((r: { user_id: string }) => r.user_id),
  )

  const users: CommunityUser[] = (profiles ?? []).map(
    (p: {
      id: string
      full_name: string | null
      avatar_url: string | null
      category_id: string | null
      team_id: string | null
    }) => ({
      id: p.id,
      name: p.full_name,
      avatarUrl: p.avatar_url,
      categoryId: p.category_id,
      category: p.category_id ? (catMap.get(p.category_id) ?? null) : null,
      team: p.team_id ? (teamMap.get(p.team_id) ?? null) : null,
      isProfessor: professorIds.has(p.id),
    }),
  )

  const categoryList = (categories ?? []).map((c) => ({ id: c.id, name: c.name }))

  return (
    <div className="px-5 py-4 space-y-4">
      <div>
        <h1 className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <Users className="h-5 w-5 text-secondary" />
          Comunidade
        </h1>
        <p className="text-xs text-white/40 mt-0.5">
          {users.length} {users.length === 1 ? 'jogador' : 'jogadores'} no SquashBa
        </p>
      </div>

      <ComunidadeClient users={users} categories={categoryList} />
    </div>
  )
}
