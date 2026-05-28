'use server'

import { createClient } from '@/utils/supabase/server'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ChallengeConfig = {
  name: string
  rounds: number
  counting: 'set' | 'tempo'
  setsToPlay: 1 | 3 | 5
  pointsPerSet: number
  winByTwo: boolean
  setDrawEnabled: boolean
  timeMinutes: number | null
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  tiebreakers: string[]
}

// ─── Criar Desafio 1v1 ────────────────────────────────────────────────────────

export async function createDesafio1v1(
  config: ChallengeConfig,
  opponentId: string,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Usuário não autenticado.' }
  if (opponentId === user.id) return { error: 'Você não pode desafiar a si mesmo.' }

  const allowDraw = config.counting === 'tempo' || config.setDrawEnabled

  // 1. Cria o championship como rascunho (RLS: auth.uid() = created_by)
  const { data: champ, error: champErr } = await supabase
    .from('championships')
    .insert({
      name: config.name.trim(),
      format: 'desafio',
      unit: 'player',
      status: 'rascunho',
      allow_draw: allowDraw,
      points_win: config.pointsWin,
      points_draw: allowDraw ? config.pointsDraw : 0,
      points_loss: config.pointsLoss,
      tiebreakers: config.tiebreakers,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (champErr || !champ) return { error: champErr?.message ?? 'Erro ao criar desafio.' }
  const champId = champ.id

  // 2. Fase única (RLS: can_manage_championship passa pois user é creator)
  const { error: stageErr } = await supabase.from('championship_stages').insert({
    championship_id: champId,
    name: 'Fase única',
    ordering: 1,
    kind: 'liga',
    counting: config.counting,
    rounds: config.rounds,
    sets_to_play: config.setsToPlay,
    points_per_set: config.pointsPerSet,
    win_by_two: config.winByTwo,
    set_draw_enabled: config.setDrawEnabled,
    time_minutes: config.timeMinutes,
  })

  if (stageErr) {
    await supabase.from('championships').delete().eq('id', champId)
    return { error: stageErr.message }
  }

  // 3. Participante A — criador (confirmado)
  const { data: partA, error: partAErr } = await supabase
    .from('participants')
    .insert({
      championship_id: champId,
      kind: 'player',
      enrollment_source: 'organizador',
      enrollment_status: 'confirmado',
    })
    .select('id')
    .single()

  if (partAErr || !partA) {
    await supabase.from('championships').delete().eq('id', champId)
    return { error: partAErr?.message ?? 'Erro ao criar participante.' }
  }

  const { error: memberAErr } = await supabase
    .from('participant_members')
    .insert({ participant_id: partA.id, user_id: user.id })

  if (memberAErr) {
    await supabase.from('championships').delete().eq('id', champId)
    return { error: memberAErr.message }
  }

  // 4. Participante B — oponente (pendente)
  const { data: partB, error: partBErr } = await supabase
    .from('participants')
    .insert({
      championship_id: champId,
      kind: 'player',
      enrollment_source: 'jogador',
      enrollment_status: 'pendente',
    })
    .select('id')
    .single()

  if (partBErr || !partB) {
    await supabase.from('championships').delete().eq('id', champId)
    return { error: partBErr?.message ?? 'Erro ao convidar oponente.' }
  }

  const { error: memberBErr } = await supabase
    .from('participant_members')
    .insert({ participant_id: partB.id, user_id: opponentId })

  if (memberBErr) {
    await supabase.from('championships').delete().eq('id', champId)
    return { error: memberBErr.message }
  }

  return { id: champId }
}
