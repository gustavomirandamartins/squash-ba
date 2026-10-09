'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cached-public-data'
import { createClient } from '@/utils/supabase/server'

export async function createCategory(name: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .insert({ name: name.trim() })
  if (error) throw new Error(error.message)
  revalidatePath('/gestao/categorias')
  revalidateTag(CACHE_TAGS.categories, 'max')
}

export async function updateCategory(id: string, name: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .update({ name: name.trim() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/gestao/categorias')
  revalidateTag(CACHE_TAGS.categories, 'max')
}

export async function deleteCategory(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/gestao/categorias')
  revalidateTag(CACHE_TAGS.categories, 'max')
}
