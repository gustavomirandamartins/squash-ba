'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

/**
 * Atualiza a categoria de um jogador.
 * Segurança: a RPC `update_player_category` (security definer) verifica que
 * o chamador é organizer ou admin antes de escrever na tabela profiles.
 */
export async function updatePlayerCategory(
  targetUserId: string,
  categoryId: string | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { error } = await supabase.rpc('update_player_category', {
    _target_user_id: targetUserId,
    _category_id: categoryId ?? null,
  })

  if (error) return { error: error.message }

  revalidatePath('/gestao/jogadores')
  return { error: null }
}
