'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function approveRequest(targetUserId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_organizer_request', {
    target_user_id: targetUserId,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function rejectRequest(targetUserId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_organizer_request', {
    target_user_id: targetUserId,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}
