import { createClient } from '@/utils/supabase/server'
import { getCategories } from '@/lib/cached-public-data'
import { PlayerCategoryList, type PlayerRow } from '@/components/gestao/PlayerCategoryList'

export const metadata = { title: 'Jogadores · Gestão' }

export default async function JogadoresPage() {
  const supabase = await createClient()

  const [{ data: profiles }, { data: categories }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, category_id')
      .eq('onboarding_completed', true)
      .not('full_name', 'is', null)
      .order('full_name', { ascending: true }),
    getCategories().then((data) => ({ data })).catch(() => ({ data: [] })),
  ])

  const players: PlayerRow[] = (profiles ?? []).map(
    (p: { id: string; full_name: string | null; avatar_url: string | null; category_id: string | null }) => ({
      id: p.id,
      name: p.full_name,
      avatarUrl: p.avatar_url,
      categoryId: p.category_id,
    }),
  )

  const cats = (categories ?? []).map((c: { id: string; name: string }) => ({
    id: c.id,
    name: c.name,
  }))

  return (
    <div className="px-5 py-4">
      <PlayerCategoryList players={players} categories={cats} />
    </div>
  )
}
