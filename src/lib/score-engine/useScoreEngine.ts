'use client'

// ─── Tipos públicos do contrato ──────────────────────────────────
// A UI consome APENAS este hook — nunca chama supabase.from('match_games')
// diretamente. A Fase 5 substituirá o miolo por fila local (IndexedDB + sync).

export type MatchSide = 'a' | 'b'

export type GameScore = {
  game_number: number
  score_a: number
  score_b: number
}

export type ScoreEngineState = {
  /** Todos os sets do jogo atual, indexados por game_number */
  games: GameScore[]
  /** agendado | em_andamento | finalizado */
  status: string
  /** lado_a | lado_b | empate | null */
  result: string | null
  /** Game sendo editado agora (1-based) */
  currentGame: number
  /** Operação em curso (upsert, etc.) */
  busy: boolean
  error?: string
}

export type ScoreEngineActions = {
  /** +1 ponto no lado indicado para o currentGame */
  increment: (side: MatchSide) => Promise<void>
  /** -1 ponto no lado indicado (nunca < 0) */
  decrement: (side: MatchSide) => Promise<void>
  /** Avança para o próximo game (só quando set atual resolvido) */
  advanceGame: () => Promise<void>
  /** Volta a editar um game anterior */
  reopenGame: (gameNumber: number) => Promise<void>
  /** Helper: aciona advance se necessário; status real vem do trigger */
  finalize: () => Promise<void>
  /** Zera os dados locais (não apaga o banco) */
  reset: () => Promise<void>
}

export type ScoreEngine = ScoreEngineState & ScoreEngineActions

// ─── Stub — implementação real vem no CP3 ────────────────────────
export function useScoreEngine(_matchId: string): ScoreEngine {
  return {
    games: [],
    status: 'agendado',
    result: null,
    currentGame: 1,
    busy: false,
    increment: async () => { throw new Error('useScoreEngine: não implementado (CP3)') },
    decrement: async () => { throw new Error('useScoreEngine: não implementado (CP3)') },
    advanceGame: async () => { throw new Error('useScoreEngine: não implementado (CP3)') },
    reopenGame: async () => { throw new Error('useScoreEngine: não implementado (CP3)') },
    finalize: async () => { throw new Error('useScoreEngine: não implementado (CP3)') },
    reset: async () => { throw new Error('useScoreEngine: não implementado (CP3)') },
  }
}
