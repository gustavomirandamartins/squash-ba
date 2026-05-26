'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

// ── Venues ──────────────────────────────────────────────────────────────────

export async function createVenue(name: string, address: string | null) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('venues')
    .insert({ name: name.trim(), address: address?.trim() || null })
  if (error) throw new Error(error.message)
  revalidatePath('/gestao/locais')
}

export async function updateVenue(
  id: string,
  name: string,
  address: string | null,
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('venues')
    .update({ name: name.trim(), address: address?.trim() || null })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/gestao/locais')
  revalidatePath(`/gestao/locais/${id}`)
}

export async function deleteVenue(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('venues').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/gestao/locais')
}

// ── Courts ───────────────────────────────────────────────────────────────────

export async function createCourt(venueId: string, name: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('courts')
    .insert({ venue_id: venueId, name: name.trim() })
  if (error) throw new Error(error.message)
  revalidatePath(`/gestao/locais/${venueId}`)
}

export async function updateCourt(
  id: string,
  name: string,
  venueId: string,
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('courts')
    .update({ name: name.trim() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/gestao/locais/${venueId}`)
}

export async function deleteCourt(id: string, venueId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('courts').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/gestao/locais/${venueId}`)
}
