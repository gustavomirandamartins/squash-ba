'use client'

/**
 * useScoreEngine — motor de placar offline-first.
 *
 * API pública idêntica ao stub anterior + campos extras de estado offline:
 *   isOffline, pendingCount, hasConflict, conflictSnapshot, resolveConflict
 *
 * Fluxo:
 *  1. Carrega estado inicial do Supabase (ou usa `initialState` passado pelo SSR)
 *  2. Atualiza via Realtime quando online
 *  3. increment/decrement: atualiza estado local otimisticamente → enqueue → flush best-effort
 *  4. Quando offline: ações ficam na fila (IDB) e são sincronizadas ao voltar online
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import * as Sync from './SyncEngine'
import { overlayQueuedState, mergeGames } from '@/lib/standings/compute'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type MatchSide = 'a' | 'b'

export type GameScore = {
  game_number: number
  score_a: number
  score_b: number
}

export type ConflictSnapshot = {
  games: GameScore[]
}

export type ScoreEngineState = {
  games: GameScore[]
  status: string
  result: string | null
  currentGame: number
  busy: boolean
  error?: string
  // Offline / sync extras
  isOffline: boolean
  pendingCount: number
  hasConflict: boolean
  conflictSnapshot: ConflictSnapshot | null
  // Como a partida foi encerrada (derivado de matches.is_wo / is_double_wo)
  isWo: boolean
  isDoubleWo: boolean
}

export type ScoreEngineActions = {
  increment: (side: MatchSide) => Promise<void>
  decrement: (side: MatchSide) => Promise<void>
  advanceGame: () => Promise<void>
  reopenGame: (gameNumber: number) => Promise<void>
  finalize: () => Promise<void>
  reset: () => Promise<void>
  resolveConflict: (side: 'local' | 'server') => Promise<void>
  /** Recarrega do servidor e reaplica a fila local (ex.: após DQ/W.O., que apagam o placar). */
  refresh: () => Promise<void>
}

export type ScoreEngine = ScoreEngineState & ScoreEngineActions

// ─── Config (injetada pelo ScoreScreen) ──────────────────────────────────────

export type ScoreEngineConfig = {
  sets_to_play?: number
  points_per_set?: number
  win_by_two?: boolean
  set_draw_enabled?: boolean
  counting?: string
  // Estado inicial (vindo do SSR para evitar flash)
  initialGames?: GameScore[]
  initialStatus?: string
  initialResult?: string | null
  initialConflictSnapshot?: ConflictSnapshot | null
  initialIsWo?: boolean
  initialIsDoubleWo?: boolean
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useScoreEngine(
  matchId: string,
  config: ScoreEngineConfig = {},
): ScoreEngine {
  const {
    initialGames = [],
    initialStatus = 'agendado',
    initialResult = null,
    initialConflictSnapshot = null,
    initialIsWo = false,
    initialIsDoubleWo = false,
  } = config

  // ── State ──────────────────────────────────────────────────────────────────
  const [games, setGames] = useState<GameScore[]>(initialGames)
  const [status, setStatus] = useState(initialStatus)
  const [result, setResult] = useState<string | null>(initialResult)
  const [currentGame, setCurrentGame] = useState<number>(() => {
    if (initialGames.length === 0) return 1
    return initialGames[initialGames.length - 1].game_number
  })
  const [isWo, setIsWo] = useState(initialIsWo)
  const [isDoubleWo, setIsDoubleWo] = useState(initialIsDoubleWo)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [isOffline, setIsOffline] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [hasConflict, setHasConflict] = useState(
    initialConflictSnapshot !== null || initialStatus === 'revisao',
  )
  const [conflictSnapshot, setConflictSnapshot] = useState<ConflictSnapshot | null>(
    initialConflictSnapshot,
  )

  // Supabase client — stable across renders
  const [supabase] = useState(() => createClient())

  // ── Atualiza pendingCount periodicamente ───────────────────────────────────
  const refreshPending = useCallback(async () => {
    const count = await Sync.getPendingCount(matchId)
    setPendingCount(count)
  }, [matchId])

  // Espelho síncrono dos games e do game atual. As ações calculam o próximo
  // placar a partir daqui (não do state do último render): dois toques rápidos
  // antes de o React renderizar não podem partir do mesmo valor.
  const gamesRef = useRef(games)
  const currentGameRef = useRef(currentGame)
  const commitGames = useCallback((next: GameScore[]) => {
    gamesRef.current = next
    setGames(next)
  }, [])
  const commitCurrentGame = useCallback((n: number) => {
    currentGameRef.current = n
    setCurrentGame(n)
  }, [])

  // ── Fila local sobre o estado atual ────────────────────────────────────────
  // O que já foi feito neste aparelho e ainda não chegou ao servidor (placar,
  // encerramento, W.O.) tem de continuar visível — inclusive ao reabrir a tela
  // offline, quando só há o snapshot em cache.
  const applyQueueOverlay = useCallback(async () => {
    const q = await Sync.getQueuedMatchState(matchId)
    if (!q) return
    const merged = q.clearsGames ? q.games : mergeGames(gamesRef.current, q.games)
    commitGames(merged)
    commitCurrentGame(merged.length > 0 ? merged[merged.length - 1].game_number : 1)
    const f = q.finalization
    if (!f && q.statusOverride) {
      // Reaberta ou limpa neste aparelho (ainda na fila).
      setStatus(q.statusOverride === 'agendado' && merged.length > 0 ? 'em_andamento' : q.statusOverride)
      setResult(null)
      setIsWo(false)
      setIsDoubleWo(false)
    }
    if (f) {
      setStatus('finalizado')
      setResult(f.kind === 'double_wo' ? null : f.result)
      setIsWo(f.kind === 'wo' || f.kind === 'double_wo')
      setIsDoubleWo(f.kind === 'double_wo')
    }
  }, [matchId, commitGames, commitCurrentGame])

  // ── Fetch do servidor ──────────────────────────────────────────────────────
  const fetchFromServer = useCallback(async () => {
    const { data } = await supabase
      .from('matches')
      .select(
        'status, result, is_wo, is_double_wo, conflict_server_snapshot, match_games(game_number, score_a, score_b)',
      )
      .eq('id', matchId)
      .single()

    if (!data) return

    const serverGames = (
      (data.match_games as GameScore[] | null) ?? []
    ).sort((a, b) => a.game_number - b.game_number)

    // Sem pendências, este é o estado do servidor sobre o qual os próximos
    // toques serão feitos (base para detectar conflito de verdade).
    const queued = await Sync.getQueuedMatchState(matchId)
    if (!queued) void Sync.rememberServerGames(matchId, serverGames)

    // Pendências locais prevalecem sobre o servidor (que ainda não as recebeu).
    const merged = overlayQueuedState(
      {
        games: serverGames,
        status: data.status as string,
        result: (data.result as string | null) ?? null,
        isWo: !!data.is_wo,
        isDoubleWo: !!data.is_double_wo,
      },
      queued,
    )
    const inReview = data.status === 'revisao'

    commitGames(merged.games)
    setStatus(inReview ? 'revisao' : merged.status)
    setResult(merged.result)
    setIsWo(merged.isWo)
    setIsDoubleWo(merged.isDoubleWo)

    if (merged.games.length > 0) {
      commitCurrentGame(merged.games[merged.games.length - 1].game_number)
    }

    if (inReview) {
      setHasConflict(true)
      const snap = data.conflict_server_snapshot as ConflictSnapshot | null
      setConflictSnapshot(snap)
    } else {
      setHasConflict(false)
      setConflictSnapshot(null)
      Sync.clearConflictPause(matchId)
    }
  }, [supabase, matchId, commitGames, commitCurrentGame])

  // ── Mount: fetch, track, auto-sync, realtime ───────────────────────────────
  const cleanupSyncRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    void applyQueueOverlay() // offline: o fetch abaixo falha, a fila é a verdade local
    void fetchFromServer()
    void refreshPending()

    Sync.trackMatch(matchId)

    // Auto-sync: 3s interval + online/offline events
    cleanupSyncRef.current = Sync.startAutoSync((_mid, res) => {
      if (_mid !== matchId) return
      void refreshPending()
      if (res.error) setError(`O servidor recusou uma ação: ${res.error}`)
      if (res.conflict) {
        setHasConflict(true)
        void fetchFromServer() // pega o conflictSnapshot do servidor
      } else if (res.synced > 0) {
        void fetchFromServer()
      }
    })

    // Online/Offline state tracking
    const onOnline  = () => { setIsOffline(false) }
    const onOffline = () => { setIsOffline(true) }
    if (typeof navigator !== 'undefined') {
      setIsOffline(!navigator.onLine)
    }
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)

    // Realtime: cada game gravado volta como evento (inclusive os nossos). Junta
    // os eventos de um lote numa única releitura.
    let refetchTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleRefetch = () => {
      if (refetchTimer) clearTimeout(refetchTimer)
      refetchTimer = setTimeout(() => {
        void Sync.getPendingCount(matchId).then((count) => {
          if (count === 0) void fetchFromServer()
        })
      }, 600)
    }

    const channel = supabase
      .channel(`score-engine-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_games',
          filter: `match_id=eq.${matchId}`,
        },
        // Só atualiza a partir do servidor se não há fila pendente local
        scheduleRefetch,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const row = payload.new as {
            status: string
            result: string | null
            is_wo?: boolean
            is_double_wo?: boolean
          }
          setStatus(row.status)
          setResult(row.result)
          setIsWo(!!row.is_wo)
          setIsDoubleWo(!!row.is_double_wo)
          if (row.status === 'revisao') {
            setHasConflict(true)
            void fetchFromServer()
          } else {
            setHasConflict(false)
            setConflictSnapshot(null)
          }
        },
      )
      .subscribe()

    return () => {
      if (refetchTimer) clearTimeout(refetchTimer)
      Sync.untrackMatch(matchId)
      cleanupSyncRef.current?.()
      void supabase.removeChannel(channel)
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId])

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Retorna ou cria o game atual. */
  function currentGameScore(gs: GameScore[], gameNum: number): GameScore {
    return gs.find((g) => g.game_number === gameNum) ?? {
      game_number: gameNum,
      score_a: 0,
      score_b: 0,
    }
  }

  function applyOptimistic(
    gs: GameScore[],
    gameNum: number,
    update: (g: GameScore) => GameScore,
  ): GameScore[] {
    const existing = gs.find((g) => g.game_number === gameNum)
    if (!existing) {
      return [...gs, update({ game_number: gameNum, score_a: 0, score_b: 0 })]
    }
    return gs.map((g) => (g.game_number === gameNum ? update(g) : g))
  }

  /** Grava na fila (sempre) e tenta enviar em seguida (deduplicado no SyncEngine). */
  async function enqueueAndFlush(
    type: Sync.ActionType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await Sync.enqueue({ matchId, type, payload })
    void refreshPending()
    if (!navigator.onLine) return
    const res = await Sync.flush(matchId)
    void refreshPending()
    if (res.error) setError(`O servidor recusou uma ação: ${res.error}`)
    if (res.conflict) {
      setHasConflict(true)
      void fetchFromServer()
    }
  }

  /** Aplica a mudança no game atual: estado na hora, fila em seguida. */
  function changeCurrent(update: (g: GameScore) => GameScore) {
    const gameNum = currentGameRef.current
    const updated = applyOptimistic(gamesRef.current, gameNum, update)
    commitGames(updated)
    const g = currentGameScore(updated, gameNum)
    void enqueueAndFlush('upsert_game', {
      game_number: g.game_number,
      score_a: g.score_a,
      score_b: g.score_b,
    })
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  const increment = useCallback(
    async (side: MatchSide) => {
      if (status === 'finalizado' || hasConflict) return
      changeCurrent((g) => ({
        ...g,
        score_a: side === 'a' ? g.score_a + 1 : g.score_a,
        score_b: side === 'b' ? g.score_b + 1 : g.score_b,
      }))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchId, status, hasConflict],
  )

  const decrement = useCallback(
    async (side: MatchSide) => {
      if (status === 'finalizado' || hasConflict) return
      changeCurrent((g) => ({
        ...g,
        score_a: side === 'a' ? Math.max(0, g.score_a - 1) : g.score_a,
        score_b: side === 'b' ? Math.max(0, g.score_b - 1) : g.score_b,
      }))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchId, status, hasConflict],
  )

  const advanceGame = useCallback(async () => {
    const nextGame = currentGameRef.current + 1
    commitCurrentGame(nextGame)
    const prev = gamesRef.current
    if (!prev.some((g) => g.game_number === nextGame)) {
      commitGames([...prev, { game_number: nextGame, score_a: 0, score_b: 0 }])
    }
    await enqueueAndFlush('upsert_game', { game_number: nextGame, score_a: 0, score_b: 0 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId])

  const reopenGame = useCallback(async (gameNumber: number) => {
    commitCurrentGame(gameNumber)
  }, [commitCurrentGame])

  const finalize = useCallback(async () => {
    setBusy(true)
    try {
      await Sync.flush(matchId)
      // O trigger do banco calcula resultado; apenas aguardamos o realtime update
    } finally {
      setBusy(false)
      void refreshPending()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId])

  const reset = useCallback(async () => {
    commitGames([])
    commitCurrentGame(1)
    setStatus('agendado')
    setResult(null)
    setIsWo(false)
    setIsDoubleWo(false)
    await Sync.clearQueue(matchId)
    setPendingCount(0)
  }, [matchId, commitGames, commitCurrentGame])

  const refresh = useCallback(async () => {
    await fetchFromServer()
    await applyQueueOverlay() // offline: o fetch falha e a fila é o estado local
    await refreshPending()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFromServer, applyQueueOverlay])

  const resolveConflict = useCallback(
    async (side: 'local' | 'server') => {
      setBusy(true)
      try {
        const { error: rpcError } = await supabase.rpc('resolve_match_conflict', {
          _match_id: matchId,
          _chosen_side: side,
        })
        if (rpcError) throw new Error(rpcError.message)
        if (side === 'server') {
          await Sync.clearQueue(matchId)
          setPendingCount(0)
        } else {
          // "Manter o deste aparelho": o servidor só tirou a revisão; o placar
          // local ainda está na fila. Envia sem checar conflito de novo.
          await Sync.dropBase(matchId)
          Sync.clearConflictPause(matchId)
          await Sync.flush(matchId)
        }
        setHasConflict(false)
        setConflictSnapshot(null)
        await fetchFromServer()
        await refreshPending()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao resolver conflito')
      } finally {
        setBusy(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, matchId, fetchFromServer],
  )

  return {
    games,
    status,
    result,
    currentGame,
    busy,
    error,
    isOffline,
    pendingCount,
    hasConflict,
    conflictSnapshot,
    isWo,
    isDoubleWo,
    increment,
    decrement,
    advanceGame,
    reopenGame,
    finalize,
    reset,
    resolveConflict,
    refresh,
  }
}
