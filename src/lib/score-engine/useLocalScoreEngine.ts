'use client'

// Motor de placar para partidas de campeonato LOCAL (provisório/offline).
// Opera 100% sobre o snapshot em IndexedDB — sem Supabase. Espelha a semântica
// do motor online: a partida por SETS finaliza automaticamente quando o placar
// decide (via resolveMatch); por TEMPO, finaliza manualmente.

import { useCallback, useEffect, useState } from 'react'
import { resolveMatch, type CGame, type StageCfg } from '@/lib/standings/compute'
import {
  getLocalChampionship,
  updateLocalMatch,
  type LocalMatch,
} from '@/lib/offline/local-championship'

export type LocalEngine = {
  loaded: boolean
  games: CGame[]
  status: string
  result: string | null
  currentGame: number
  editable: boolean
  increment: (side: 'a' | 'b') => void
  decrement: (side: 'a' | 'b') => void
  advanceGame: () => void
  reopenGame: (gameNumber: number) => void
  finalizeTempo: () => void
}

function upsertCurrent(
  games: CGame[],
  gameNum: number,
  side: 'a' | 'b',
  delta: number,
): CGame[] {
  const exists = games.some((g) => g.game_number === gameNum)
  const base = exists ? games : [...games, { game_number: gameNum, score_a: 0, score_b: 0 }]
  return base.map((g) =>
    g.game_number === gameNum
      ? {
          ...g,
          score_a: side === 'a' ? Math.max(0, g.score_a + delta) : g.score_a,
          score_b: side === 'b' ? Math.max(0, g.score_b + delta) : g.score_b,
        }
      : g,
  )
}

export function useLocalScoreEngine(
  tempId: string,
  matchId: string,
  stage: StageCfg,
): LocalEngine {
  const [loaded, setLoaded] = useState(false)
  const [games, setGames] = useState<CGame[]>([])
  const [status, setStatus] = useState<string>('agendado')
  const [result, setResult] = useState<string | null>(null)
  const [currentGame, setCurrentGame] = useState(1)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const champ = await getLocalChampionship(tempId)
      const m = champ?.matches.find((x) => x.id === matchId)
      if (cancelled) return
      if (m) {
        setGames(m.games)
        setStatus(m.status)
        setResult(m.result)
        setCurrentGame(
          m.games.length ? Math.max(...m.games.map((g) => g.game_number)) : 1,
        )
      }
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [tempId, matchId])

  const persist = useCallback(
    (g: CGame[], st: string, res: string | null) => {
      void updateLocalMatch(tempId, matchId, {
        games: g,
        status: st as LocalMatch['status'],
        result: res as LocalMatch['result'],
      })
    },
    [tempId, matchId],
  )

  // Aplica novo placar e (para sets) finaliza automaticamente se decidido.
  const applyGames = useCallback(
    (next: CGame[]) => {
      let st = 'em_andamento'
      let res: string | null = null
      if (stage.counting !== 'tempo') {
        const r = resolveMatch(next, stage)
        if (r.finalized) {
          st = 'finalizado'
          res = r.result
        }
      }
      setGames(next)
      setStatus(st)
      setResult(res)
      persist(next, st, res)
    },
    [stage, persist],
  )

  const editable = status !== 'finalizado'

  const increment = useCallback(
    (side: 'a' | 'b') => {
      if (!editable) return
      applyGames(upsertCurrent(games, currentGame, side, +1))
    },
    [editable, games, currentGame, applyGames],
  )

  const decrement = useCallback(
    (side: 'a' | 'b') => {
      if (!editable) return
      applyGames(upsertCurrent(games, currentGame, side, -1))
    },
    [editable, games, currentGame, applyGames],
  )

  const advanceGame = useCallback(() => {
    const next = currentGame + 1
    setCurrentGame(next)
    if (!games.some((g) => g.game_number === next)) {
      const g = [...games, { game_number: next, score_a: 0, score_b: 0 }]
      setGames(g)
      persist(g, 'em_andamento', null)
    }
  }, [currentGame, games, persist])

  const reopenGame = useCallback((gameNumber: number) => {
    setCurrentGame(gameNumber)
  }, [])

  // Finalização manual para contagem por TEMPO (placar único do game 1).
  const finalizeTempo = useCallback(() => {
    if (stage.counting !== 'tempo') return
    const g = games[0] ?? { game_number: 1, score_a: 0, score_b: 0 }
    let res: string | null = null
    if (g.score_a > g.score_b) res = 'lado_a'
    else if (g.score_b > g.score_a) res = 'lado_b'
    else if (stage.set_draw_enabled) res = 'empate'
    if (!res) return // empate não permitido: não finaliza
    const next = games.length ? games : [g]
    setGames(next)
    setStatus('finalizado')
    setResult(res)
    persist(next, 'finalizado', res)
  }, [stage, games, persist])

  return {
    loaded,
    games,
    status,
    result,
    currentGame,
    editable,
    increment,
    decrement,
    advanceGame,
    reopenGame,
    finalizeTempo,
  }
}
