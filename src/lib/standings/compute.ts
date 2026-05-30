// Cálculo de classificação no CLIENTE — espelha a lógica do servidor
// (resolve_match + v_participant_match_stats + get_standings) para permitir
// classificação ao vivo offline, refletindo placares lançados sem rede.
//
// Usado apenas como caminho OFFLINE; online a fonte da verdade segue sendo o
// RPC get_standings.

import type { Standing } from '@/components/campeonatos/StandingsTable'

export type CGame = { game_number: number; score_a: number; score_b: number }

export type CMatch = {
  side_a_participant_id: string | null
  side_b_participant_id: string | null
  games: CGame[]
}

export type StageCfg = {
  counting: string
  points_per_set: number
  win_by_two: boolean
  set_draw_enabled: boolean
  sets_to_play: number
}

export type ChampCfg = {
  pointsWin: number
  pointsDraw: number
  pointsLoss: number
  tiebreakers: string[]
}

export type ParticipantRef = { id: string; name: string | null }

type Resolved = {
  finalized: boolean
  result: 'lado_a' | 'lado_b' | 'empate' | null
  setsA: number
  setsB: number
}

// Porta de resolve_match.
export function resolveMatch(games: CGame[], st: StageCfg): Resolved {
  if (st.counting === 'tempo') {
    const g = games[0]
    if (!g) return { finalized: false, result: null, setsA: 0, setsB: 0 }
    if (g.score_a > g.score_b) return { finalized: true, result: 'lado_a', setsA: 1, setsB: 0 }
    if (g.score_b > g.score_a) return { finalized: true, result: 'lado_b', setsA: 0, setsB: 1 }
    if (st.set_draw_enabled) return { finalized: true, result: 'empate', setsA: 0, setsB: 0 }
    return { finalized: false, result: null, setsA: 0, setsB: 0 }
  }

  const P = st.points_per_set
  const w2 = st.win_by_two
  const need = Math.floor(st.sets_to_play / 2) + 1
  let sa = 0, sb = 0, sd = 0, gc = 0
  for (const g of games) {
    gc++
    if (w2) {
      if (g.score_a >= P && g.score_a - g.score_b >= 2) sa++
      else if (g.score_b >= P && g.score_b - g.score_a >= 2) sb++
      else if (st.set_draw_enabled && g.score_a === g.score_b && g.score_a >= P) sd++
    } else {
      if (g.score_a >= P && g.score_a > g.score_b) sa++
      else if (g.score_b >= P && g.score_b > g.score_a) sb++
      else if (st.set_draw_enabled && g.score_a === g.score_b && g.score_a >= P) sd++
    }
  }

  if (sa >= need) return { finalized: true, result: 'lado_a', setsA: sa, setsB: sb }
  if (sb >= need) return { finalized: true, result: 'lado_b', setsA: sa, setsB: sb }
  if (gc >= st.sets_to_play && sa + sb + sd === st.sets_to_play) {
    if (sa > sb) return { finalized: true, result: 'lado_a', setsA: sa, setsB: sb }
    if (sb > sa) return { finalized: true, result: 'lado_b', setsA: sa, setsB: sb }
    if (st.set_draw_enabled) return { finalized: true, result: 'empate', setsA: sa, setsB: sb }
  }
  return { finalized: false, result: null, setsA: sa, setsB: sb }
}

// Mescla os games do snapshot (servidor) com os games da fila offline.
export function mergeGames(snapshot: CGame[], queued: CGame[] | null): CGame[] {
  if (!queued || queued.length === 0) return snapshot
  const map = new Map<number, CGame>()
  for (const g of snapshot) map.set(g.game_number, g)
  for (const g of queued) map.set(g.game_number, g)
  return [...map.values()].sort((a, b) => a.game_number - b.game_number)
}

// Porta de get_standings (com tiebreakers configuráveis).
export function computeStandings(
  matches: CMatch[],
  participants: ParticipantRef[],
  st: StageCfg,
  champ: ChampCfg,
): Standing[] {
  type Acc = {
    v: number; e: number; d: number
    sets_ganhos: number; sets_perdidos: number; sets_empatados: number
    pontos_favor: number; pontos_contra: number
  }
  const acc = new Map<string, Acc>()
  const ensure = (id: string) => {
    let a = acc.get(id)
    if (!a) {
      a = { v: 0, e: 0, d: 0, sets_ganhos: 0, sets_perdidos: 0, sets_empatados: 0, pontos_favor: 0, pontos_contra: 0 }
      acc.set(id, a)
    }
    return a
  }
  for (const p of participants) ensure(p.id)

  for (const m of matches) {
    const a = m.side_a_participant_id
    const b = m.side_b_participant_id
    if (!a || !b) continue
    const r = resolveMatch(m.games, st)
    if (!r.finalized) continue

    const pfA = m.games.reduce((s, g) => s + g.score_a, 0)
    const pfB = m.games.reduce((s, g) => s + g.score_b, 0)

    const accA = ensure(a)
    const accB = ensure(b)
    accA.pontos_favor += pfA; accA.pontos_contra += pfB
    accB.pontos_favor += pfB; accB.pontos_contra += pfA
    accA.sets_ganhos += r.setsA; accA.sets_perdidos += r.setsB
    accB.sets_ganhos += r.setsB; accB.sets_perdidos += r.setsA

    if (r.result === 'empate') {
      accA.e++; accB.e++
    } else if (r.result === 'lado_a') {
      accA.v++; accB.d++
    } else if (r.result === 'lado_b') {
      accB.v++; accA.d++
    }
  }

  const nameById = new Map(participants.map((p) => [p.id, p.name]))

  const rows = [...acc.entries()].map(([id, a]) => ({
    participant_id: id,
    display_name: nameById.get(id) ?? null,
    pontos: a.v * champ.pointsWin + a.e * champ.pointsDraw + a.d * champ.pointsLoss,
    v: a.v, e: a.e, d: a.d,
    sets_ganhos: a.sets_ganhos,
    sets_perdidos: a.sets_perdidos,
    sets_empatados: a.sets_empatados,
    pontos_favor: a.pontos_favor,
    pontos_contra: a.pontos_contra,
    saldo_pontos: a.pontos_favor - a.pontos_contra,
  }))

  rows.sort((x, y) => {
    if (y.pontos !== x.pontos) return y.pontos - x.pontos
    for (const tb of champ.tiebreakers) {
      if (tb === 'sets_ganhos' && y.sets_ganhos !== x.sets_ganhos) return y.sets_ganhos - x.sets_ganhos
      if (tb === 'pontos_ganhos' && y.pontos_favor !== x.pontos_favor) return y.pontos_favor - x.pontos_favor
      if (tb === 'pontos_sofridos_asc' && x.pontos_contra !== y.pontos_contra) return x.pontos_contra - y.pontos_contra
    }
    return (x.display_name ?? '').localeCompare(y.display_name ?? '')
  })

  return rows.map((r, i) => ({ position: i + 1, ...r }))
}
