// Campeonato "provisório" Liga, criado e usado OFFLINE antes de sincronizar.
//
// Espelha o suficiente do servidor (generate_liga_matches + leitura) para
// permitir abrir, jogar e classificar offline. Persistido em IndexedDB
// (idb-keyval) sob a chave `local-champ:<tempId>`. Ao reconectar, o OfflineSync
// cria o campeonato real e reconcilia os placares lançados aqui.
//
// Escopo atual: APENAS Liga (round-robin). Eliminatória/Grupos ficam para depois.

import { get, set, del } from 'idb-keyval'
import type { CGame, StageCfg, ChampCfg } from '@/lib/standings/compute'

const keyFor = (tempId: string) => `local-champ:${tempId}`

export type LocalGame = CGame // { game_number, score_a, score_b }

export type LocalParticipant = {
  id: string            // id local (lp-...)
  userIds: string[]     // user_ids dos membros (1 = jogador, 2 = dupla)
  name: string | null
  avatarUrl: string | null
}

export type LocalMatch = {
  id: string            // id local (lm-...)
  round: number
  sideA: string | null  // id de LocalParticipant
  sideB: string | null
  status: 'agendado' | 'em_andamento' | 'finalizado'
  result: 'lado_a' | 'lado_b' | 'empate' | null
  games: LocalGame[]
}

export type LocalChampionship = {
  tempId: string
  format: 'liga'
  unit: 'player' | 'pair'
  name: string
  startDate: string | null
  stage: StageCfg          // counting/points_per_set/win_by_two/set_draw_enabled/sets_to_play
  rounds: number
  champ: ChampCfg          // pointsWin/pointsDraw/pointsLoss/tiebreakers
  participants: LocalParticipant[]
  matches: LocalMatch[]
  createdAt: number
}

function uid(prefix: string): string {
  const r =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(36).slice(2)
  return `${prefix}-${r}`
}

// ── Geração round-robin (porta fiel de generate_liga_matches) ────────────────
// Participantes na ordem de entrada; para cada rodada, pares (i<j).
export function generateLigaMatches(
  participants: LocalParticipant[],
  rounds: number,
): LocalMatch[] {
  const n = participants.length
  const out: LocalMatch[] = []
  if (n < 2) return out
  for (let r = 1; r <= rounds; r++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        out.push({
          id: uid('lm'),
          round: r,
          sideA: participants[i].id,
          sideB: participants[j].id,
          status: 'agendado',
          result: null,
          games: [],
        })
      }
    }
  }
  return out
}

// ── Builder ──────────────────────────────────────────────────────────────────
export type BuildLigaInput = {
  name: string
  startDate: string | null
  unit: 'player' | 'pair'
  stage: StageCfg
  rounds: number
  champ: ChampCfg
  // ordem importa (define a ordem de geração, igual ao servidor)
  participants: { userIds: string[]; name: string | null; avatarUrl: string | null }[]
}

export function buildLocalLiga(tempId: string, input: BuildLigaInput): LocalChampionship {
  const participants: LocalParticipant[] = input.participants.map((p) => ({
    id: uid('lp'),
    userIds: p.userIds,
    name: p.name,
    avatarUrl: p.avatarUrl,
  }))
  return {
    tempId,
    format: 'liga',
    unit: input.unit,
    name: input.name,
    startDate: input.startDate,
    stage: input.stage,
    rounds: input.rounds,
    champ: input.champ,
    participants,
    matches: generateLigaMatches(participants, input.rounds),
    createdAt: Date.now(),
  }
}

// ── CRUD IndexedDB ─────────────────────────────────────────────────────────
export async function getLocalChampionship(tempId: string): Promise<LocalChampionship | null> {
  return ((await get(keyFor(tempId))) as LocalChampionship | undefined) ?? null
}

export async function saveLocalChampionship(champ: LocalChampionship): Promise<void> {
  await set(keyFor(champ.tempId), champ)
}

export async function removeLocalChampionship(tempId: string): Promise<void> {
  await del(keyFor(tempId))
}

export async function updateLocalMatch(
  tempId: string,
  matchId: string,
  patch: Partial<LocalMatch>,
): Promise<LocalChampionship | null> {
  const champ = await getLocalChampionship(tempId)
  if (!champ) return null
  champ.matches = champ.matches.map((m) => (m.id === matchId ? { ...m, ...patch } : m))
  await saveLocalChampionship(champ)
  return champ
}

// ── Adaptador para o cálculo de classificação (computeStandings) ─────────────
export function toOfflineStandingsData(champ: LocalChampionship) {
  return {
    matches: champ.matches.map((m) => ({
      id: m.id,
      side_a_participant_id: m.sideA,
      side_b_participant_id: m.sideB,
      match_games: m.games,
    })),
    participants: champ.participants.map((p) => ({ id: p.id, name: p.name })),
    stage: champ.stage,
    champ: champ.champ,
  }
}

export function participantAvatarMap(champ: LocalChampionship): Record<string, string | null> {
  return Object.fromEntries(champ.participants.map((p) => [p.id, p.avatarUrl]))
}
