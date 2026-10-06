// Estado efetivo de um campeonato real OFFLINE: o cache do servidor + o que
// este aparelho já fez e ainda está na fila (placar, encerramento, W.O.,
// reabrir…). Sobre isso, aplica as mesmas regras do servidor:
//   • a partida por sets encerra sozinha quando o placar decide (resolve_match);
//   • o vencedor avança na chave (propagate_bracket_advances), preenchendo a
//     vaga seguinte — então a próxima rodada abre offline.
// Ao sincronizar, o servidor recalcula tudo com as mesmas regras.

import { overlayQueuedState, type StageCfg } from '@/lib/standings/compute'
import type { QueuedMatchState } from '@/lib/score-engine/SyncEngine'
import type { CachedChamp, CachedMatch, CachedSide } from './champ-cache'

export function stageOf(m: CachedMatch): StageCfg {
  return {
    counting: m.counting,
    points_per_set: m.pointsPerSet,
    win_by_two: m.winByTwo,
    set_draw_enabled: m.setDrawEnabled,
    sets_to_play: m.setsToPlay,
  }
}

/** Uma partida do cache com a fila local por cima (e encerramento automático). */
export function withQueue(m: CachedMatch, q: QueuedMatchState | null): CachedMatch {
  const st = overlayQueuedState(
    {
      games: m.games,
      status: m.status,
      result: m.result,
      isWo: m.isWo ?? false,
      isDoubleWo: m.isDoubleWo ?? false,
    },
    q,
    stageOf(m),
  )
  return { ...m, games: st.games, status: st.status, result: st.result, isWo: st.isWo, isDoubleWo: st.isDoubleWo }
}

/**
 * Preenche as vagas da chave com os vencedores já conhecidos neste aparelho.
 * Só mexe em vaga que o servidor ainda deixou vazia (o que veio do servidor
 * prevalece). Ordem por rodada: o avanço desce em cascata numa passada.
 */
export function propagateCached(champ: CachedChamp, matches: CachedMatch[]): CachedMatch[] {
  const out = matches.map((m) => ({ ...m }))
  const byId = new Map(out.map((m) => [m.id, m]))
  // vagas que o servidor deixou vazias (só essas podem ser preenchidas aqui)
  const serverEmpty = new Map(
    matches.map((m) => [m.id, { a: !m.sideAId, b: !m.sideBId }]),
  )
  const sideInfo = (id: string): CachedSide => champ.sides?.[id] ?? { name: null, avatarUrl: null }

  const feeders = out
    .filter((m) => m.winnerAdvancesTo && (m.bracketSlot ?? 0) > 0)
    .sort((a, b) => a.round - b.round)
  for (const m of feeders) {
    const next = byId.get(m.winnerAdvancesTo!)
    if (!next) continue
    const winner =
      m.status === 'finalizado'
        ? m.result === 'lado_a' ? m.sideAId ?? null : m.result === 'lado_b' ? m.sideBId ?? null : null
        : null
    const toA = (m.bracketSlot ?? 0) % 2 === 1
    const empty = serverEmpty.get(next.id)
    if (toA && empty?.a) {
      next.sideAId = winner
      next.sideA = winner ? sideInfo(winner) : { name: null, avatarUrl: null }
    } else if (!toA && empty?.b) {
      next.sideBId = winner
      next.sideB = winner ? sideInfo(winner) : { name: null, avatarUrl: null }
    }
  }
  return out
}

/** Todas as partidas efetivas: fila por cima + chave avançada. */
export function effectiveMatches(
  champ: CachedChamp,
  queued: Map<string, QueuedMatchState | null>,
): CachedMatch[] {
  const overlaid = champ.matches.map((m) => withQueue(m, queued.get(m.id) ?? null))
  // Cache antigo (sem ids de participante): não há como avançar a chave.
  if (!champ.sides) return overlaid
  return propagateCached(champ, overlaid)
}
