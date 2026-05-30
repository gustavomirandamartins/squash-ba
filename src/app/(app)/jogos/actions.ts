'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Reabre uma partida finalizada para que o placar possa ser corrigido.
 * Apenas organizadores/admins (can_manage_championship) podem reabrir.
 */
export async function reopenMatch(matchId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  // Busca o campeonato da partida e verifica se está finalizada
  const { data: match } = await supabase
    .from('matches')
    .select('championship_id, status')
    .eq('id', matchId)
    .single()

  if (!match) return { error: 'Partida não encontrada.' }
  if (match.status !== 'finalizado') return { error: 'A partida não está finalizada.' }

  // Apenas organizadores/admins podem reabrir (não qualquer participante)
  const { data: canManage } = await supabase.rpc('can_manage_championship', {
    _championship_id: match.championship_id,
  })
  if (!canManage) return { error: 'Sem permissão para reabrir esta partida.' }

  // Reabre: volta para em_andamento e limpa o resultado
  const { error } = await supabase
    .from('matches')
    .update({ status: 'em_andamento', result: null })
    .eq('id', matchId)

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { error: null }
}
