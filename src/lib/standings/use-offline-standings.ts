'use client'

// Hook reutilizável de classificação offline ao vivo. Quando offline, recompõe
// a classificação no cliente a partir do snapshot + fila de placares (IndexedDB).
// Quando online, retorna offline=false e o chamador usa sua fonte online (RPC/SSR).

import { useState, useEffect, useCallback } from 'react'
import { getQueuedMatchState } from '@/lib/score-engine/SyncEngine'
import {
  computeStandings,
  resolveMatch,
  overlayQueuedState,
  type CMatch,
  type StageCfg,
  type ChampCfg,
  type ParticipantRef,
} from './compute'
import type { Standing } from '@/components/campeonatos/StandingsTable'

export type OfflineStandingsInput = {
  matches: Array<{
    id: string
    side_a_participant_id: string | null
    side_b_participant_id: string | null
    match_games: Array<{ game_number: number; score_a: number; score_b: number }>
    /** estado da partida no snapshot (p/ contar encerramento manual, DQ e W.O.) */
    status?: string
    result?: string | null
    is_wo?: boolean
    is_double_wo?: boolean
  }>
  participants: ParticipantRef[]
  stage: StageCfg
  champ: ChampCfg
}

export type OfflineStandingsResult = {
  offline: boolean
  standings: Standing[] | null
  /** matchId → finalizado (recalculado localmente) */
  finalizedById: Record<string, boolean>
}

export function useOfflineStandings(data?: OfflineStandingsInput): OfflineStandingsResult {
  const [offline, setOffline] = useState(false)
  const [standings, setStandings] = useState<Standing[] | null>(null)
  const [finalizedById, setFinalizedById] = useState<Record<string, boolean>>({})

  const compute = useCallback(async () => {
    if (!data) return
    const finalized: Record<string, boolean> = {}
    const cmatches: CMatch[] = await Promise.all(
      data.matches.map(async (m) => {
        const st = overlayQueuedState(
          {
            games: m.match_games,
            status: m.status ?? 'agendado',
            result: m.result ?? null,
            isWo: m.is_wo ?? false,
            isDoubleWo: m.is_double_wo ?? false,
          },
          await getQueuedMatchState(m.id),
        )
        finalized[m.id] = st.status === 'finalizado' || resolveMatch(st.games, data.stage).finalized
        return {
          side_a_participant_id: m.side_a_participant_id,
          side_b_participant_id: m.side_b_participant_id,
          games: st.games,
          status: st.status,
          result: st.result,
          is_wo: st.isWo,
          is_double_wo: st.isDoubleWo,
        }
      }),
    )
    setStandings(computeStandings(cmatches, data.participants, data.stage, data.champ))
    setFinalizedById(finalized)
  }, [data])

  useEffect(() => {
    const isOff = typeof navigator !== 'undefined' && !navigator.onLine
    setOffline(isOff)
    if (isOff) void compute()

    const onOnline = () => setOffline(false)
    const onOffline = () => { setOffline(true); void compute() }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [compute])

  return { offline, standings, finalizedById }
}
