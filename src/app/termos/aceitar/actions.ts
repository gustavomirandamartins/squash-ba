'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function acceptTerms(): Promise<{ error: string } | void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('accept_terms')
  if (error) return { error: 'Não foi possível registrar o aceite. Tente de novo.' }
  redirect('/')
}
