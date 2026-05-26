import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { EditProfileForm } from './EditProfileForm'

export const metadata: Metadata = {
  title: 'Editar perfil',
}

type Gender = 'masculino' | 'feminino' | 'outro' | 'nao_informado'

export default async function PerfilPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, birth_date, gender, avatar_url')
    .eq('id', user.id)
    .single()

  const { data: priv } = await supabase
    .from('profiles_private')
    .select('phone, email')
    .eq('user_id', user.id)
    .single()

  return (
    <EditProfileForm
      userId={user.id}
      email={priv?.email ?? user.email ?? ''}
      initial={{
        fullName: profile?.full_name ?? '',
        birthDate: profile?.birth_date ?? '',
        gender: (profile?.gender as Gender) ?? 'nao_informado',
        phone: priv?.phone ?? '',
        avatarUrl: profile?.avatar_url ?? null,
      }}
    />
  )
}
