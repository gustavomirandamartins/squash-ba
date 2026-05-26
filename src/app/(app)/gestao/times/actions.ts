'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function createTeam(
  name: string,
  address: string | null,
  has_own_venue: boolean,
  home_venue_id: string | null,
) {
  const supabase = await createClient()
  const { error } = await supabase.from('teams').insert({
    name: name.trim(),
    address: address?.trim() || null,
    has_own_venue,
    home_venue_id: has_own_venue ? home_venue_id : null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/gestao/times')
}

export async function updateTeam(
  id: string,
  name: string,
  address: string | null,
  has_own_venue: boolean,
  home_venue_id: string | null,
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('teams')
    .update({
      name: name.trim(),
      address: address?.trim() || null,
      has_own_venue,
      home_venue_id: has_own_venue ? home_venue_id : null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/gestao/times')
}

export async function deleteTeam(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('teams').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/gestao/times')
}
