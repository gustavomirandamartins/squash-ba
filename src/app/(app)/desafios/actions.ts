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
  venueId?: string | null
}

// Criação por RPC transacional (create_challenge): tudo numa transação no
// banco, com as validações de cada tipo — o app iOS chama a mesma função.

function challengeJson(config: ChallengeConfig) {
  return {
    name: config.name.trim(),
    points_win: config.pointsWin,
    points_draw: config.pointsDraw,
    points_loss: config.pointsLoss,
    tiebreakers: config.tiebreakers,
    venue_id: config.venueId ?? null,
    stage: {
      counting: config.counting,
      rounds: config.rounds,
      sets_to_play: config.setsToPlay,
      points_per_set: config.pointsPerSet,
      win_by_two: config.winByTwo,
      set_draw_enabled: config.setDrawEnabled,
      time_minutes: config.timeMinutes,
    },
  }
}

async function createChallengeRpc(
  c: Record<string, unknown>,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc('create_challenge', { _c: c })
  if (error) return { error: error.message }
  if (!id) return { error: 'Erro ao criar desafio.' }
  return { id: id as string }
}

// ─── Criar Desafio 1v1 ────────────────────────────────────────────────────────
// O oponente entra pendente; o desafio ativa quando ele aceita o convite.

export async function createDesafio1v1(
  config: ChallengeConfig,
  opponentId: string,
): Promise<{ id: string } | { error: string }> {
  return createChallengeRpc({ ...challengeJson(config), type: '1v1', opponent_id: opponentId })
}

// ─── Criar Desafio de Duplas (2v2) ────────────────────────────────────────────
// "Organizador monta tudo": escolhe parceiro + dupla adversária. Sem convite —
// ambas as duplas entram confirmadas e o desafio ativa imediatamente.

export async function createDesafioDuplas(
  config: ChallengeConfig,
  partnerId: string,
  opponentIds: [string, string],
): Promise<{ id: string } | { error: string }> {
  return createChallengeRpc({
    ...challengeJson(config),
    type: 'duplas',
    partner_id: partnerId,
    opponent_ids: opponentIds,
  })
}

// ─── Criar Desafio de Times (NxN) ─────────────────────────────────────────────
// Organizador escolhe 2 times registrados e metade dos jogadores de cada um.
// O backend (generate_team_challenge_matches) gera jogos cruzados entre times
// opostos. has_final opcional → final entre o melhor de cada time (gerada depois).

export type TeamSidePayload = {
  teamId: string
  name: string
  playerIds: string[]
}

export async function createDesafioTimes(
  config: ChallengeConfig,
  hasFinal: boolean,
  teamA: TeamSidePayload,
  teamB: TeamSidePayload,
): Promise<{ id: string } | { error: string }> {
  const side = (t: TeamSidePayload) => ({ team_id: t.teamId, name: t.name, player_ids: t.playerIds })
  return createChallengeRpc({
    ...challengeJson(config),
    type: 'times',
    has_final: hasFinal,
    team_a: side(teamA),
    team_b: side(teamB),
  })
}
