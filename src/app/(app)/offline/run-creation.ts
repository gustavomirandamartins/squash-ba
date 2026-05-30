'use server'

// Dispatcher único de criação — usado tanto no submit online quanto no replay
// da fila offline ao reconectar. Cada caso delega ao criador já existente.

import {
  createLigaChampionship,
  createEliminatoriaChampionship,
  createGruposElimChampionship,
} from '@/app/(app)/campeonatos/actions'
import {
  createDesafio1v1,
  createDesafioDuplas,
  createDesafioTimes,
} from '@/app/(app)/desafios/actions'
import type { CreationOp } from '@/lib/offline/types'

export async function runCreation(
  op: CreationOp,
): Promise<{ id: string } | { error: string }> {
  switch (op.type) {
    case 'champ_liga':
      return createLigaChampionship(op.cfg)
    case 'champ_elim':
      return createEliminatoriaChampionship(op.cfg)
    case 'champ_grupos':
      return createGruposElimChampionship(op.cfg)
    case 'desafio_1v1':
      return createDesafio1v1(op.cfg, op.opponentId)
    case 'desafio_duplas':
      return createDesafioDuplas(op.cfg, op.partnerId, op.opponentIds)
    case 'desafio_times':
      return createDesafioTimes(op.cfg, op.hasFinal, op.teamA, op.teamB)
    default:
      return { error: 'Operação de criação desconhecida.' }
  }
}
