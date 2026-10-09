import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, getAuthUser } from '@/utils/supabase/server'
import { getCategories } from '@/lib/cached-public-data'
import { EditProfileForm } from './EditProfileForm'

export const metadata: Metadata = {
  title: 'Editar perfil',
}

type Gender = 'masculino' | 'feminino' | 'outro' | 'nao_informado'

export default async function PerfilPage() {
  const supabase = await createClient()

  const user = await getAuthUser()

  if (!user) {
    redirect('/login')
  }

  const [
    { data: profile },
    { data: priv },
    { data: categories },
    { data: teams },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, birth_date, gender, avatar_url, category_id, team_id')
      .eq('id', user.id)
      .single(),
    supabase
      .from('profiles_private')
      .select('phone, email')
      .eq('user_id', user.id)
      .single(),
    // em cache (muda pouco; invalidado ao editar categorias)
    getCategories().then((data) => ({ data })).catch(() => ({ data: [] })),
    supabase.from('teams').select('id, name').order('name'),
  ])

  return (
    <EditProfileForm
      userId={user.id}
      email={priv?.email ?? user.email ?? ''}
      categories={categories ?? []}
      teams={teams ?? []}
      initial={{
        fullName: profile?.full_name ?? '',
        birthDate: profile?.birth_date ?? '',
        gender: (profile?.gender as Gender) ?? 'nao_informado',
        phone: priv?.phone ?? '',
        avatarUrl: profile?.avatar_url ?? null,
        categoryId: profile?.category_id ?? null,
        teamId: profile?.team_id ?? null,
      }}
    />
  )
}
