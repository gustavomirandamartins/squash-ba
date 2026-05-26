'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function createCategory(name: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .insert({ name: name.trim() })
  if (error) throw new Error(error.message)
  revalidatePath('/gestao/categorias')
}

export async function updateCategory(id: string, name: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .update({ name: name.trim() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/gestao/categorias')
}

export async function deleteCategory(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/gestao/categorias')
}
