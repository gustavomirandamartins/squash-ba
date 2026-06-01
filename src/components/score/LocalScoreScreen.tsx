'use client'

// Tela de placar para partidas de campeonato LOCAL (provisório/offline).
// Reaproveita os componentes visuais do ScoreScreen (TapZone/GameRow/PlayerAvatar)
// e é guiada pelo useLocalScoreEngine (sem Supabase). Mais simples que o online:
// sem conflito, sem realtime, sem agenda.

import { ChevronLeft, RotateCcw } from 'lucide-react'
import { TapZone, GameRow, type SideInfo } from './ScoreScreen'
import { useLocalScoreEngine } from '@/lib/score-engine/useLocalScoreEngine'
import type { StageCfg } from '@/lib/standings/compute'

export function LocalScoreScreen({
  tempId,
  matchId,
  sideA,
  sideB,
  stage,
  onBack,
}: {
  tempId: string
  matchId: string
  sideA: SideInfo
  sideB: SideInfo
  stage: StageCfg
  onBack: () => void
}) {
  const engine = useLocalScoreEngine(tempId, matchId, stage)
  const {
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
  } = engine

  const isTempo = stage.counting === 'tempo'
  const isSets = stage.counting === 'set' || stage.counting === 'sets'
  const isFinished = status === 'finalizado'
  const setsToPlay = stage.sets_to_play

  const currentGameData =
    games.find((g) => g.game_number === currentGame) ?? {
      game_number: currentGame,
      score_a: 0,
      score_b: 0,
    }
  const winnerA = result === 'lado_a'
  const winnerB = result === 'lado_b'

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition"
        >
          <ChevronLeft className="h-4 w-4" />
          Jogos
        </button>
        {isFinished ? (
          <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-[11px] font-medium text-white/40">
            Encerrado
          </span>
        ) : (
          <span className="rounded-full bg-secondary/15 px-2.5 py-0.5 text-[11px] font-semibold text-secondary">
            Provisório
          </span>
        )}
      </div>

      {!loaded ? (
        <div className="glass glass-card px-4 py-10 text-center text-sm text-white/35">
          Carregando…
        </div>
      ) : (
        <>
          {/* Placar do game atual */}
          <div className="glass glass-card px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25 text-center mb-3">
              {isTempo ? 'Placar' : `Set ${currentGame}`}
              {!isTempo && stage.points_per_set > 0 &&
                ` · até ${stage.points_per_set}${stage.win_by_two ? '+2' : ''}`}
            </p>
            <div className="flex gap-3">
              <TapZone
                side="a"
                score={currentGameData.score_a}
                name={sideA.name}
                avatarUrl={sideA.avatarUrl}
                onIncrement={() => increment('a')}
                onDecrement={() => decrement('a')}
                disabled={!editable}
                isWinner={winnerA}
              />
              <div className="flex items-center shrink-0 self-center">
                <div className="w-px h-20 bg-white/10 rounded-full" />
              </div>
              <TapZone
                side="b"
                score={currentGameData.score_b}
                name={sideB.name}
                avatarUrl={sideB.avatarUrl}
                onIncrement={() => increment('b')}
                onDecrement={() => decrement('b')}
                disabled={!editable}
                isWinner={winnerB}
              />
            </div>
          </div>

          {/* Histórico de sets */}
          {isSets && games.length > 0 && (
            <div className="glass glass-card px-3 py-2.5 space-y-1">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-white/20 px-1 mb-1.5">
                Sets
              </p>
              {games.map((g) => (
                <GameRow
                  key={g.game_number}
                  game={g}
                  isActive={g.game_number === currentGame}
                  onReopen={() => reopenGame(g.game_number)}
                />
              ))}
            </div>
          )}

          {/* Avançar set */}
          {editable && isSets && games.length > 0 && games.length < setsToPlay && (
            <button
              type="button"
              onClick={advanceGame}
              className="w-full glass glass-card py-3 text-xs font-semibold text-white/40 hover:text-white/70 transition text-center rounded-2xl"
            >
              ↓ Encerrar set e avançar
            </button>
          )}

          {/* Encerrar partida (tempo) */}
          {editable && isTempo && (
            <button
              type="button"
              onClick={finalizeTempo}
              className="w-full rounded-2xl bg-secondary py-3 text-sm font-bold text-primary transition active:scale-95"
            >
              Encerrar partida
            </button>
          )}

          {/* Resultado final */}
          {isFinished && (
            <div className="glass glass-card px-4 py-4 text-center space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
                Resultado final
              </p>
              <p className="text-base font-black text-secondary">
                {result === 'empate'
                  ? 'Empate'
                  : `${(result === 'lado_a' ? sideA.name : sideB.name) ?? 'Lado'} venceu`}
              </p>
            </div>
          )}

          {/* Reabrir partida (corrigir placar) */}
          {isFinished && (
            <button
              type="button"
              onClick={reopenMatch}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] py-3 text-xs font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white/75 active:scale-95"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reabrir partida
            </button>
          )}

          {/* Aviso provisório */}
          <p className="text-[11px] text-white/30 text-center px-4">
            Placar salvo neste aparelho. Sincroniza ao reconectar.
          </p>
        </>
      )}
    </div>
  )
}
