'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markFeedbackRead(formData: FormData) {
  const id = formData.get('id') as string
  if (!id) return

  const supabase = await createClient()
  await supabase.from('feedback').update({ status: 'lido' }).eq('id', id)
  revalidatePath('/gestao/feedbacks')
}
