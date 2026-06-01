import type { LigaCfg, EliminatoriaCfg, GruposElimCfg } from '@/app/(app)/campeonatos/actions'
import type { ChallengeConfig, TeamSidePayload } from '@/app/(app)/desafios/actions'

// Operação de criação — autocontida e re-executável (o servidor gera o ID no
// momento do replay; não há remapeamento de IDs entre operações).
export type CreationOp =
  | { type: 'champ_liga'; cfg: LigaCfg }
  | { type: 'champ_elim'; cfg: EliminatoriaCfg }
  | { type: 'champ_grupos'; cfg: GruposElimCfg }
  | { type: 'desafio_1v1'; cfg: ChallengeConfig; opponentId: string }
  | { type: 'desafio_duplas'; cfg: ChallengeConfig; partnerId: string; opponentIds: [string, string] }
  | { type: 'desafio_times'; cfg: ChallengeConfig; hasFinal: boolean; teamA: TeamSidePayload; teamB: TeamSidePayload }

export type CreationKind = 'campeonato' | 'desafio'

// Dados mínimos para renderizar o item enquanto pendente de sincronização.
export type PendingSnapshot = {
  name: string
  subtitle: string
  detail?: string
}

export type OutboxStatus = 'pending' | 'syncing' | 'error'

export type OutboxItem = {
  tempId: string
  kind: CreationKind
  op: CreationOp
  snapshot: PendingSnapshot
  status: OutboxStatus
  error?: string
  createdAt: number
  /** id REAL do campeonato após criação no servidor. Permite retry sem recriar
   *  (a migração de placares — reconciliação — pode ser repetida com segurança). */
  createdRealId?: string
}

export function destForCreation(kind: CreationKind, id: string): string {
  return kind === 'campeonato' ? `/campeonatos/${id}` : `/desafios/${id}`
}
