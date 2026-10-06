'use client'

// Motor de placar para partidas de campeonato LOCAL (provisório/offline).
// Opera 100% sobre o snapshot em IndexedDB — sem Supabase. Espelha a semântica
// do motor online: a partida por SETS finaliza automaticamente quando o placar
// decide (via resolveMatch); por TEMPO, finaliza manualmente.

import { useCallback, useEffect, useRef, useState } from 'react'
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
  reopenMatch: () => void
  finalizeTempo: () => void
  /** Aviso para o organizador (ex.: empate não permitido ao encerrar por tempo). */
  notice: string | null
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
  const [notice, setNotice] = useState<string | null>(null)

  // Espelhos síncronos: dois toques antes do próximo render não podem partir
  // do mesmo placar (o segundo ponto se perderia).
  const gamesRef = useRef<CGame[]>([])
  const currentGameRef = useRef(1)
  const statusRef = useRef('agendado')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const champ = await getLocalChampionship(tempId)
      const m = champ?.matches.find((x) => x.id === matchId)
      if (cancelled) return
      if (m) {
        const cg = m.games.length ? Math.max(...m.games.map((g) => g.game_number)) : 1
        gamesRef.current = m.games
        currentGameRef.current = cg
        statusRef.current = m.status
        setGames(m.games)
        setStatus(m.status)
        setResult(m.result)
        setCurrentGame(cg)
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

  const commit = useCallback(
    (g: CGame[], st: string, res: string | null) => {
      gamesRef.current = g
      statusRef.current = st
      setGames(g)
      setStatus(st)
      setResult(res)
      persist(g, st, res)
    },
    [persist],
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
      setNotice(null)
      commit(next, st, res)
    },
    [stage, commit],
  )

  const editable = status !== 'finalizado'

  const increment = useCallback(
    (side: 'a' | 'b') => {
      if (statusRef.current === 'finalizado') return
      applyGames(upsertCurrent(gamesRef.current, currentGameRef.current, side, +1))
    },
    [applyGames],
  )

  const decrement = useCallback(
    (side: 'a' | 'b') => {
      if (statusRef.current === 'finalizado') return
      applyGames(upsertCurrent(gamesRef.current, currentGameRef.current, side, -1))
    },
    [applyGames],
  )

  const advanceGame = useCallback(() => {
    const next = currentGameRef.current + 1
    currentGameRef.current = next
    setCurrentGame(next)
    const gs = gamesRef.current
    if (!gs.some((g) => g.game_number === next)) {
      commit([...gs, { game_number: next, score_a: 0, score_b: 0 }], 'em_andamento', null)
    }
  }, [commit])

  const reopenGame = useCallback((gameNumber: number) => {
    currentGameRef.current = gameNumber
    setCurrentGame(gameNumber)
  }, [])

  // Reabre a partida finalizada para corrigir o placar (igual ao online). Ao
  // voltar para a lista, a chave é corrigida (propagateBracketAdvances).
  const reopenMatch = useCallback(() => {
    setNotice(null)
    commit(gamesRef.current, 'em_andamento', null)
  }, [commit])

  // Finalização manual para contagem por TEMPO (placar único do game 1).
  const finalizeTempo = useCallback(() => {
    if (stage.counting !== 'tempo') return
    const gs = gamesRef.current
    const g = gs[0] ?? { game_number: 1, score_a: 0, score_b: 0 }
    let res: string | null = null
    if (g.score_a > g.score_b) res = 'lado_a'
    else if (g.score_b > g.score_a) res = 'lado_b'
    else if (stage.set_draw_enabled) res = 'empate'
    if (!res) {
      setNotice('Placar empatado e esta fase não permite empate. Marque o ponto decisivo para encerrar.')
      return
    }
    setNotice(null)
    commit(gs.length ? gs : [g], 'finalizado', res)
  }, [stage, commit])

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
    reopenMatch,
    finalizeTempo,
    notice,
  }
}
