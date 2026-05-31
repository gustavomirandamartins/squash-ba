'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

// Exclusão (campeonato OU desafio — ambos são linhas de championships).
// RLS championships_delete = can_manage_championship(id). Filhos têm ON DELETE CASCADE.
// Retorna { error } em vez de lançar exception: em produção, Server Actions que
// lançam exceções caem no error boundary do Next.js (mensagem genérica), não no
// try/catch do componente chamador.
export async function deleteChampionship(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase.from('championships').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/campeonatos')
  revalidatePath('/jogos')
  revalidatePath('/')
  return { error: null }
}

// Edição de campeonato. Renome sempre permitido; demais configurações só em rascunho
// (com partidas/standings ainda não gerados). Estruturais (formato, participantes) ficam fora.
export type ChampSettingsPayload = {
  id: string
  name: string
  draft: boolean
  startDate?: string | null
  pointsWin?: number
  pointsDraw?: number
  pointsLoss?: number
  stageId?: string | null
  setsToPlay?: number
  pointsPerSet?: number
  winByTwo?: boolean
}

export async function updateChampionshipSettings(p: ChampSettingsPayload): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const champUpdate: Record<string, unknown> = { name: p.name.trim() }
  // Data de início pode ser alterada a qualquer momento (informativa).
  if (p.startDate !== undefined) champUpdate.start_date = p.startDate || null
  if (p.draft) {
    if (p.pointsWin != null) champUpdate.points_win = p.pointsWin
    if (p.pointsDraw != null) champUpdate.points_draw = p.pointsDraw
    if (p.pointsLoss != null) champUpdate.points_loss = p.pointsLoss
  }
  const { error: e1 } = await supabase.from('championships').update(champUpdate).eq('id', p.id)
  if (e1) return { error: e1.message }

  if (p.draft && p.stageId) {
    const stageUpdate: Record<string, unknown> = {}
    if (p.setsToPlay != null) stageUpdate.sets_to_play = p.setsToPlay
    if (p.pointsPerSet != null) stageUpdate.points_per_set = p.pointsPerSet
    if (p.winByTwo != null) stageUpdate.win_by_two = p.winByTwo
    if (Object.keys(stageUpdate).length) {
      const { error: e2 } = await supabase.from('championship_stages').update(stageUpdate).eq('id', p.stageId)
      if (e2) return { error: e2.message }
    }
  }

  revalidatePath(`/campeonatos/${p.id}`)
  revalidatePath('/')
  return { error: null }
}

// Ativa um campeonato em rascunho. O trigger championship_status gera os jogos
// (liga → round-robin; eliminatoria → bracket). RLS de UPDATE em championships
// já exige can_manage_championship.
export async function activateChampionship(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { data: champ } = await supabase
    .from('championships')
    .select('status')
    .eq('id', id)
    .single()

  if (!champ) return { error: 'Campeonato não encontrado.' }
  if (champ.status !== 'rascunho') return { error: 'O campeonato não está em rascunho.' }

  const { error } = await supabase.from('championships').update({ status: 'ativo' }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/campeonatos/${id}`)
  revalidatePath('/campeonatos')
  revalidatePath('/')
  return { error: null }
}

// Edição de desafio. Renome sempre; nº de partidas só em rascunho (antes do aceite/geração).
export type ChallengeSettingsPayload = {
  id: string
  name: string
  draft: boolean
  stageId?: string | null
  rounds?: number
}

export async function updateChallengeSettings(p: ChallengeSettingsPayload): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { error: e1 } = await supabase.from('championships').update({ name: p.name.trim() }).eq('id', p.id)
  if (e1) return { error: e1.message }

  if (p.draft && p.stageId && p.rounds != null) {
    const { error: e2 } = await supabase.from('championship_stages').update({ rounds: p.rounds }).eq('id', p.stageId)
    if (e2) return { error: e2.message }
  }

  revalidatePath(`/desafios/${p.id}`)
  revalidatePath('/')
  return { error: null }
}
