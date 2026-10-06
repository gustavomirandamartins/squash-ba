// Campeonato "provisório" criado e usado OFFLINE antes de sincronizar.
//
// Espelha o suficiente do servidor (geração de jogos + leitura) para permitir
// abrir, jogar e classificar offline. Persistido em IndexedDB (idb-keyval) sob a
// chave `local-champ:<tempId>`. Ao reconectar, o OfflineSync cria o campeonato
// real e reconcilia os placares lançados aqui.
//
// Formatos suportados offline: Liga (round-robin), Eliminatória (bracket ATP com
// byes e avanço de vencedores), Grupos+Elim (round-robin por grupo → bracket
// gerado a partir dos classificados) e Desafio de duplas / por times (com a
// final entre o melhor de cada time). Espelha as funções PL/pgSQL do servidor
// (generate_liga_matches, generate_bracket_matches, propagate_bracket_advances,
// generate_grupos_matches, generate_bracket_from_groups) para que a reconciliação
// case 1:1. Repescagem (classificados ímpares) fica fora do snapshot offline.
//
// NOTA (3º lugar): o servidor atual NÃO gera a disputa de 3º lugar — o loop de
// generate_bracket_matches sempre encerra com a rodada final (tamanho 1), então a
// condição do bronze (>= 2) nunca é satisfeita. Para não divergir na sincronização,
// também não geramos o bronze offline. O campo hasThirdPlace fica preservado para
// compatibilidade futura.

import { get, set, del, update } from 'idb-keyval'
import { computeStandings, type CGame, type StageCfg, type ChampCfg } from '@/lib/standings/compute'

const keyFor = (tempId: string) => `local-champ:${tempId}`

export type LocalFormat = 'liga' | 'eliminatoria' | 'grupos_elim' | 'desafio'

export type LocalGame = CGame // { game_number, score_a, score_b }

export type LocalParticipant = {
  id: string            // id local (lp-...)
  userIds: string[]     // user_ids dos membros (1 = jogador, 2 = dupla)
  name: string | null
  avatarUrl: string | null
  seed: number | null   // seed (eliminatória) — null = sem seed
  groupId: string | null // id de LocalGroup (grupos_elim) — null fora de grupos
}

export type LocalMatch = {
  id: string            // id local (lm-...)
  round: number
  sideA: string | null  // id de LocalParticipant
  sideB: string | null
  status: 'agendado' | 'em_andamento' | 'finalizado'
  result: 'lado_a' | 'lado_b' | 'empate' | null
  games: LocalGame[]
  // ── Campos de bracket (eliminatória / fase elim de grupos_elim) ──
  bracketSlot?: number | null      // > 0 nas chaves; null nos jogos de grupo/liga
  winnerAdvancesTo?: string | null // id da próxima LocalMatch
  // ── Campos de grupos_elim ──
  groupId?: string | null          // id de LocalGroup quando é jogo de fase de grupos
  phase?: 'grupos' | 'eliminatoria'
}

export type LocalGroup = {
  id: string            // id local (lg-...)
  name: string          // 'Grupo A', 'Grupo B', …
  participantIds: string[]
}

// Desafio por times: os dois lados (cada jogador é um participante do time).
export type LocalTeam = {
  id: string            // id local (lt-...)
  name: string
  teamId: string        // teams.id (time cadastrado)
  participantIds: string[]
}

export type LocalChampionship = {
  tempId: string
  format: LocalFormat
  /** 'team' = desafio por times (participantes são jogadores de cada time) */
  unit: 'player' | 'pair' | 'team'
  name: string
  startDate: string | null
  stage: StageCfg          // Liga/elim: config de placar. grupos_elim: config dos GRUPOS.
  elimStage?: StageCfg     // grupos_elim: config de placar da fase eliminatória
  rounds: number           // Liga/grupos: ciclos de round-robin
  champ: ChampCfg          // pointsWin/pointsDraw/pointsLoss/tiebreakers
  hasThirdPlace?: boolean  // preservado p/ compat. (servidor não gera bronze hoje)
  numGroups?: number       // grupos_elim
  groups?: LocalGroup[]    // grupos_elim
  bracketGenerated?: boolean // grupos_elim: bracket já criado a partir dos grupos?
  qualifierIds?: string[]    // grupos_elim: classificados que geraram o bracket atual
  teams?: LocalTeam[]        // desafio por times
  hasFinal?: boolean         // desafio por times: final entre o melhor de cada time
  participants: LocalParticipant[]
  matches: LocalMatch[]
  createdAt: number
}

function uid(prefix: string): string {
  const r =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(36).slice(2)
  return `${prefix}-${r}`
}

// Agenda um round-robin completo pelo MÉTODO DO CÍRCULO: cada jogador joga uma
// vez por "matchday", então os jogos ficam intercalados (não concentrados num só
// jogador). Retorna os pares na ordem de exibição.
function circleSchedule(ids: string[]): [string, string][] {
  const arr = [...ids]
  if (arr.length % 2 === 1) arr.push('__BYE__') // bye para nº ímpar
  const n = arr.length
  const half = n / 2
  const days = n - 1
  const fixed = arr[0]
  let rot = arr.slice(1)
  const pairs: [string, string][] = []
  for (let d = 0; d < days; d++) {
    const day = [fixed, ...rot]
    for (let i = 0; i < half; i++) {
      const a = day[i]
      const b = day[n - 1 - i]
      if (a !== '__BYE__' && b !== '__BYE__') pairs.push([a, b])
    }
    // rotaciona mantendo o primeiro fixo
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)]
  }
  return pairs
}

// ── Geração round-robin ──────────────────────────────────────────────────────
// O conjunto de pares por ciclo é o mesmo do servidor (todos contra todos); só a
// ORDEM é intercalada (método do círculo) p/ não concentrar os jogos. round =
// número do ciclo (1..rounds), igual ao servidor — a reconciliação casa por
// (round + membros dos lados), independente da ordem.
export function generateLigaMatches(
  participants: LocalParticipant[],
  rounds: number,
): LocalMatch[] {
  const n = participants.length
  const out: LocalMatch[] = []
  if (n < 2) return out
  const ids = participants.map((p) => p.id)
  for (let cycle = 1; cycle <= rounds; cycle++) {
    for (const [a, b] of circleSchedule(ids)) {
      out.push({
        id: uid('lm'),
        round: cycle,
        sideA: a,
        sideB: b,
        status: 'agendado',
        result: null,
        games: [],
      })
    }
  }
  return out
}

// ── Builder ──────────────────────────────────────────────────────────────────
export type BuildLigaInput = {
  name: string
  startDate: string | null
  unit: 'player' | 'pair'
  stage: StageCfg
  rounds: number
  champ: ChampCfg
  // ordem importa (define a ordem de geração, igual ao servidor)
  participants: { userIds: string[]; name: string | null; avatarUrl: string | null }[]
}

export function buildLocalLiga(tempId: string, input: BuildLigaInput): LocalChampionship {
  const participants: LocalParticipant[] = input.participants.map((p) => ({
    id: uid('lp'),
    userIds: p.userIds,
    name: p.name,
    avatarUrl: p.avatarUrl,
    seed: null,
    groupId: null,
  }))
  return {
    tempId,
    format: 'liga',
    unit: input.unit,
    name: input.name,
    startDate: input.startDate,
    stage: input.stage,
    rounds: input.rounds,
    champ: input.champ,
    participants,
    matches: generateLigaMatches(participants, input.rounds),
    createdAt: Date.now(),
  }
}

// ── Desafios ─────────────────────────────────────────────────────────────────

type SideInput = { userIds: string[]; name: string | null; avatarUrl: string | null }

export type BuildDesafioDuplasInput = {
  name: string
  stage: StageCfg
  rounds: number
  champ: ChampCfg
  /** [sua dupla, dupla adversária] */
  pairs: [SideInput, SideInput]
}

// Desafio de duplas: 2 duplas, `rounds` jogos entre elas (generate_liga_matches).
export function buildLocalDesafioDuplas(tempId: string, input: BuildDesafioDuplasInput): LocalChampionship {
  const participants: LocalParticipant[] = input.pairs.map((p) => ({
    id: uid('lp'),
    userIds: p.userIds,
    name: p.name,
    avatarUrl: p.avatarUrl,
    seed: null,
    groupId: null,
  }))
  return {
    tempId,
    format: 'desafio',
    unit: 'pair',
    name: input.name,
    startDate: null,
    stage: input.stage,
    rounds: input.rounds,
    champ: input.champ,
    participants,
    matches: generateLigaMatches(participants, input.rounds),
    createdAt: Date.now(),
  }
}

export type BuildDesafioTimesInput = {
  name: string
  stage: StageCfg
  rounds: number
  champ: ChampCfg
  hasFinal: boolean
  teams: [
    { teamId: string; name: string; players: SideInput[] },
    { teamId: string; name: string; players: SideInput[] },
  ]
}

// Desafio por times: cada jogador de A × cada jogador de B, por rodada
// (espelha generate_team_challenge_matches, na mesma ordem).
export function buildLocalDesafioTimes(tempId: string, input: BuildDesafioTimesInput): LocalChampionship {
  const participants: LocalParticipant[] = []
  const teams: LocalTeam[] = input.teams.map((t) => {
    const ids = t.players.map((p) => {
      const lp: LocalParticipant = {
        id: uid('lp'),
        userIds: p.userIds,
        name: p.name,
        avatarUrl: p.avatarUrl,
        seed: null,
        groupId: null,
      }
      participants.push(lp)
      return lp.id
    })
    return { id: uid('lt'), name: t.name, teamId: t.teamId, participantIds: ids }
  })

  const matches: LocalMatch[] = []
  const [a, b] = teams
  for (let r = 1; r <= input.rounds; r++) {
    for (const pa of a.participantIds) {
      for (const pb of b.participantIds) {
        matches.push({ id: uid('lm'), round: r, sideA: pa, sideB: pb, status: 'agendado', result: null, games: [] })
      }
    }
  }

  return {
    tempId,
    format: 'desafio',
    unit: 'team',
    name: input.name,
    startDate: null,
    stage: input.stage,
    rounds: input.rounds,
    champ: input.champ,
    teams,
    hasFinal: input.hasFinal,
    participants,
    matches,
    createdAt: Date.now(),
  }
}

/** A final do desafio por times (bracket_slot = -1, como no servidor). */
export const isTeamFinal = (m: LocalMatch) => m.bracketSlot === -1

/** Classificação individual dos jogos do desafio (sem a final). */
export function desafioStandings(champ: LocalChampionship) {
  return computeStandings(
    champ.matches
      .filter((m) => !isTeamFinal(m))
      .map((m) => ({
        side_a_participant_id: m.sideA,
        side_b_participant_id: m.sideB,
        games: m.games,
        status: m.status,
        result: m.result,
      })),
    champ.participants.map((p) => ({ id: p.id, name: p.name })),
    champ.stage,
    champ.champ,
  )
}

/**
 * Final do desafio por times: com todos os jogos encerrados, o melhor de cada
 * time (sets ganhos, depois pontos a favor — generate_team_challenge_final) faz
 * a final. Se um jogo for reaberto/corrigido antes da final começar, a final é
 * refeita (ou retirada). Retorna true se mudou algo.
 */
export function syncTeamFinal(champ: LocalChampionship): boolean {
  if (champ.format !== 'desafio' || !champ.hasFinal || champ.teams?.length !== 2) return false
  const final = champ.matches.find(isTeamFinal)
  if (final && (final.games.length > 0 || final.status === 'finalizado')) return false

  const main = champ.matches.filter((m) => !isTeamFinal(m))
  const allDone = main.length > 0 && main.every((m) => m.status === 'finalizado')
  if (!allDone) {
    if (!final) return false
    champ.matches = main
    return true
  }

  const standings = desafioStandings(champ)
  const order = new Map(champ.participants.map((p, i) => [p.id, i]))
  const top = (team: LocalTeam): string | null => {
    const ids = new Set(team.participantIds)
    return (
      standings
        .filter((s) => ids.has(s.participant_id))
        .sort(
          (x, y) =>
            y.sets_ganhos - x.sets_ganhos ||
            y.pontos_favor - x.pontos_favor ||
            (order.get(x.participant_id) ?? 0) - (order.get(y.participant_id) ?? 0),
        )[0]?.participant_id ?? null
    )
  }
  const [ta, tb] = champ.teams
  const sideA = top(ta)
  const sideB = top(tb)
  if (!sideA || !sideB) return false

  if (final) {
    if (final.sideA === sideA && final.sideB === sideB) return false
    final.sideA = sideA
    final.sideB = sideB
    return true
  }
  champ.matches = [
    ...champ.matches,
    { id: uid('lm'), round: 999, sideA, sideB, status: 'agendado', result: null, games: [], bracketSlot: -1 },
  ]
  return true
}

// ── Geração de bracket (eliminatória) ────────────────────────────────────────
// Porta EXATA de generate_bracket_matches (20260528070000_eliminatoria_fix.sql):
// seeding ATP iterativo + byes + rodadas placeholder + winnerAdvancesTo.
// NÃO gera bronze (servidor também não — ver nota no topo do arquivo).

// Pares ATP para um bracket de tamanho `size` (potência de 2).
// (1,2) → expande cada (a,b) em (a, 2S+1-a) e (2S+1-b, b).
function atpPairs(size: number): [number, number][] {
  let a = [1]
  let b = [2]
  let cur = 2
  while (cur < size) {
    const na: number[] = []
    const nb: number[] = []
    for (let i = 0; i < a.length; i++) {
      na.push(a[i]); nb.push(cur * 2 + 1 - a[i])
      na.push(cur * 2 + 1 - b[i]); nb.push(b[i])
    }
    a = na; b = nb; cur *= 2
  }
  return a.map((x, i) => [x, b[i]] as [number, number])
}

// Ordena participantes para seeding: seed asc (null = 9999), mantendo a ordem de
// entrada nos empates (espelha `order by coalesce(seed,9999), created_at`).
function seededOrder(participants: LocalParticipant[]): LocalParticipant[] {
  return participants
    .map((p, i) => ({ p, i }))
    .sort((x, y) => {
      const sx = x.p.seed ?? 9999
      const sy = y.p.seed ?? 9999
      if (sx !== sy) return sx - sy
      return x.i - y.i
    })
    .map((e) => e.p)
}

// Seeding por "posições alternadas" (método de generate_bracket_from_groups):
// positions = [1, size, 2, size-1, 3, size-2, …]; o k-ésimo classificado ocupa o
// slot positions[k]. Difere do ATP iterativo — usado SÓ na transição grupos→bracket.
function alternatingPositions(size: number): number[] {
  const positions: number[] = []
  let lo = 1
  let hi = size
  let toggle = true
  for (let i = 0; i < size; i++) {
    if (toggle) { positions.push(lo); lo++ }
    else { positions.push(hi); hi-- }
    toggle = !toggle
  }
  return positions
}

// Builder comum: recebe os slots da rodada 1 já preenchidos (slot → participantId
// ou null = bye) e monta rodada 1 (pares adjacentes) + rodadas placeholder +
// winnerAdvancesTo. Byes vêm finalizados.
function buildBracketFromFilled(filled: (string | null)[]): LocalMatch[] {
  const size = filled.length
  const out: LocalMatch[] = []

  // ── Rodada 1 (pares adjacentes: slots 1-2, 3-4, …) ──
  const curRoundIds: (string | null)[] = []
  let slot = 1
  for (let i = 0; i < size; i += 2) {
    const ma = filled[i]
    const mb = filled[i + 1]
    if (ma === null && mb === null) {
      curRoundIds.push(null)
    } else if (ma === null) {
      const id = uid('lm')
      out.push({ id, round: 1, bracketSlot: slot, phase: 'eliminatoria', sideA: null, sideB: mb, status: 'finalizado', result: 'lado_b', games: [] })
      curRoundIds.push(id)
    } else if (mb === null) {
      const id = uid('lm')
      out.push({ id, round: 1, bracketSlot: slot, phase: 'eliminatoria', sideA: ma, sideB: null, status: 'finalizado', result: 'lado_a', games: [] })
      curRoundIds.push(id)
    } else {
      const id = uid('lm')
      out.push({ id, round: 1, bracketSlot: slot, phase: 'eliminatoria', sideA: ma, sideB: mb, status: 'agendado', result: null, games: [] })
      curRoundIds.push(id)
    }
    slot++
  }

  // ── Rodadas seguintes (placeholders) ──
  let prev = curRoundIds
  let round = 2
  let half = size / 2
  while (half >= 2) {
    const next: (string | null)[] = []
    for (let i = 0; i < prev.length; i += 2) {
      const id = uid('lm')
      out.push({ id, round, bracketSlot: Math.floor(i / 2) + 1, phase: 'eliminatoria', sideA: null, sideB: null, status: 'agendado', result: null, games: [] })
      next.push(id)
      if (prev[i]) { const m = out.find((x) => x.id === prev[i]); if (m) m.winnerAdvancesTo = id }
      if (prev[i + 1]) { const m = out.find((x) => x.id === prev[i + 1]); if (m) m.winnerAdvancesTo = id }
    }
    prev = next
    round++
    half = Math.floor(half / 2)
  }

  return out
}

// Bracket de ELIMINATÓRIA standalone — seeding ATP iterativo (generate_bracket_matches).
// `seeded` já vem na ordem de seeding (seededOrder).
export function generateBracketMatches(seeded: LocalParticipant[]): LocalMatch[] {
  const n = seeded.length
  if (n < 2) return []
  let size = 1
  while (size < n) size *= 2
  const slotPart = (pos: number): string | null => (pos <= n ? seeded[pos - 1].id : null)
  // achata os pares ATP em slots da rodada 1: [a1,b1, a2,b2, …]
  const filled: (string | null)[] = []
  for (const [pa, pb] of atpPairs(size)) {
    filled.push(slotPart(pa))
    filled.push(slotPart(pb))
  }
  return buildBracketFromFilled(filled)
}

// Bracket a partir dos CLASSIFICADOS dos grupos — seeding por posições alternadas
// (generate_bracket_from_groups). `qualifiers` na ordem [1ºG1,1ºG2,…,2ºG1,…].
export function generateBracketFromQualifiers(qualifierIds: string[]): LocalMatch[] {
  const total = qualifierIds.length
  if (total < 2) return []
  let size = 1
  while (size < total) size *= 2
  const positions = alternatingPositions(size)
  const filled: (string | null)[] = Array.from({ length: size }, () => null)
  for (let i = 0; i < size; i++) {
    if (i < total) filled[positions[i] - 1] = qualifierIds[i]
  }
  return buildBracketFromFilled(filled)
}

// Propaga vencedores no bracket: cada match com winnerAdvancesTo define o lado A
// (bracket_slot ímpar) ou B (par) do próximo — o vencedor se finalizado, vazio
// se não. Idempotente e corrige: se uma partida foi reaberta ou o vencedor
// mudou, o lado seguinte é trocado e, se a próxima já tinha placar (de outro
// confronto), ela volta a "agendada". Espelha propagate_bracket_advances (sem
// bronze). Retorna true se houve alteração.
export function propagateBracketAdvances(champ: LocalChampionship): boolean {
  const byId = new Map(champ.matches.map((m) => [m.id, m]))
  let changed = false
  // rodada asc: a correção desce em cascata numa passada
  const feeders = champ.matches
    .filter((m) => m.winnerAdvancesTo)
    .sort((a, b) => a.round - b.round)
  for (const m of feeders) {
    const next = byId.get(m.winnerAdvancesTo!)
    if (!next) continue
    const winner =
      m.status === 'finalizado'
        ? m.result === 'lado_a' ? m.sideA : m.result === 'lado_b' ? m.sideB : null
        : null
    const toA = (m.bracketSlot ?? 0) % 2 === 1
    if ((toA ? next.sideA : next.sideB) === winner) continue
    if (toA) next.sideA = winner
    else next.sideB = winner
    if (next.games.length > 0 || next.status !== 'agendado') {
      next.games = []
      next.status = 'agendado'
      next.result = null
    }
    changed = true
  }
  return changed
}

// ── Builder Eliminatória ─────────────────────────────────────────────────────
export type BuildElimInput = {
  name: string
  startDate: string | null
  unit: 'player' | 'pair'
  stage: StageCfg
  champ: ChampCfg
  hasThirdPlace: boolean
  // ordem de entrada importa para o desempate de seed (= created_at no servidor)
  participants: { userIds: string[]; name: string | null; avatarUrl: string | null; seed: number | null }[]
}

export function buildLocalEliminatoria(tempId: string, input: BuildElimInput): LocalChampionship {
  const participants: LocalParticipant[] = input.participants.map((p) => ({
    id: uid('lp'),
    userIds: p.userIds,
    name: p.name,
    avatarUrl: p.avatarUrl,
    seed: p.seed,
    groupId: null,
  }))

  // N=3 → triangular (round-robin), igual ao servidor.
  const matches =
    participants.length === 3
      ? generateLigaMatches(participants, 1)
      : generateBracketMatches(seededOrder(participants))

  const champ: LocalChampionship = {
    tempId,
    format: 'eliminatoria',
    unit: input.unit,
    name: input.name,
    startDate: input.startDate,
    stage: input.stage,
    rounds: 1,
    champ: input.champ,
    hasThirdPlace: input.hasThirdPlace,
    participants,
    matches,
    createdAt: Date.now(),
  }
  // propaga byes imediatamente (lado único já tem vencedor)
  propagateBracketAdvances(champ)
  return champ
}

// ── Geração round-robin por grupo ────────────────────────────────────────────
// `round` é o ciclo global (igual à Liga); a reconciliação casa por
// (grupo + rodada + par-de-membros), então a ORDEM interna não importa.
export function generateGroupMatches(groups: LocalGroup[], rounds: number): LocalMatch[] {
  const out: LocalMatch[] = []
  for (const g of groups) {
    if (g.participantIds.length < 2) continue
    for (let cycle = 1; cycle <= rounds; cycle++) {
      for (const [a, b] of circleSchedule(g.participantIds)) {
        out.push({
          id: uid('lm'),
          round: cycle,
          sideA: a,
          sideB: b,
          status: 'agendado',
          result: null,
          games: [],
          groupId: g.id,
          phase: 'grupos',
        })
      }
    }
  }
  return out
}

// ── Builder Grupos+Elim ──────────────────────────────────────────────────────
export type BuildGruposInput = {
  name: string
  startDate: string | null
  unit: 'player' | 'pair'
  groupsStage: StageCfg
  elimStage: StageCfg
  champ: ChampCfg
  hasThirdPlace: boolean
  numGroups: number
  rounds: number
  // groupIndex JÁ resolvido conforme o servidor fará (snake p/ jogadores, explícito p/ duplas)
  participants: { userIds: string[]; name: string | null; avatarUrl: string | null; seed: number | null; groupIndex: number }[]
}

const GROUP_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export function buildLocalGrupos(tempId: string, input: BuildGruposInput): LocalChampionship {
  const groups: LocalGroup[] = Array.from({ length: input.numGroups }, (_, gi) => ({
    id: uid('lg'),
    name: `Grupo ${GROUP_NAMES[gi] ?? String(gi + 1)}`,
    participantIds: [],
  }))

  const participants: LocalParticipant[] = input.participants.map((p) => {
    const gi = p.groupIndex >= 0 && p.groupIndex < input.numGroups ? p.groupIndex : 0
    const id = uid('lp')
    groups[gi].participantIds.push(id)
    return {
      id,
      userIds: p.userIds,
      name: p.name,
      avatarUrl: p.avatarUrl,
      seed: p.seed,
      groupId: groups[gi].id,
    }
  })

  return {
    tempId,
    format: 'grupos_elim',
    unit: input.unit,
    name: input.name,
    startDate: input.startDate,
    stage: input.groupsStage,
    elimStage: input.elimStage,
    rounds: input.rounds,
    champ: input.champ,
    hasThirdPlace: input.hasThirdPlace,
    numGroups: input.numGroups,
    groups,
    bracketGenerated: false,
    participants,
    matches: generateGroupMatches(groups, input.rounds),
    createdAt: Date.now(),
  }
}

// Quantos classificados por grupo: ceil(tamanho/2) — espelha
// generate_bracket_from_groups (o servidor ignora qualifiersPerGroup do wizard).
export function qualifiersPerGroup(groupSize: number): number {
  return Math.ceil(groupSize / 2)
}

// Total de classificados de um campeonato grupos_elim (p/ checar paridade).
export function totalQualifiers(groups: { participantIds: string[] }[]): number {
  return groups.reduce((s, g) => s + qualifiersPerGroup(g.participantIds.length), 0)
}

// Se todos os jogos de grupos terminaram e o bracket ainda não foi gerado,
// computa os classificados (ceil(size/2) por grupo, ordem [1ºG1,1ºG2,…,2ºG1,…]),
// gera o bracket no elimStage e anexa as matches. Espelha generate_bracket_from_groups.
// Retorna true se gerou o bracket agora.
export function maybeGenerateBracketFromGroups(champ: LocalChampionship): boolean {
  if (champ.format !== 'grupos_elim' || !champ.groups) return false
  const groupMatches = champ.matches.filter((m) => m.phase === 'grupos')
  if (groupMatches.length === 0) return false
  const allDone = groupMatches.every((m) => m.status === 'finalizado')

  // Bracket já gerado, mas um jogo de grupo foi reaberto/corrigido depois:
  // enquanto nenhum jogo da chave foi disputado, refaz a chave com a
  // classificação atual (senão ficaria com os classificados antigos).
  let dropped = false
  if (champ.bracketGenerated) {
    const elim = champ.matches.filter((m) => m.phase === 'eliminatoria')
    const started = elim.some((m) => m.games.length > 0 || (m.status === 'finalizado' && m.sideA && m.sideB))
    if (started) return false
    if (allDone && sameIds(champ.qualifierIds, computeQualifierIds(champ, groupMatches))) return false
    champ.matches = champ.matches.filter((m) => m.phase !== 'eliminatoria')
    champ.bracketGenerated = false
    champ.qualifierIds = undefined
    dropped = true
  }
  if (!allDone) return dropped

  const qualifierIds = computeQualifierIds(champ, groupMatches)
  if (qualifierIds.length < 2) return dropped

  // Seeding por posições alternadas (espelha generate_bracket_from_groups), na
  // ordem cross-group [1ºG1,1ºG2,…,2ºG1,…].
  const bracket = generateBracketFromQualifiers(qualifierIds)
  champ.matches = [...champ.matches, ...bracket]
  champ.bracketGenerated = true
  champ.qualifierIds = qualifierIds
  propagateBracketAdvances(champ)
  return true
}

function sameIds(a: string[] | undefined, b: string[]): boolean {
  return !!a && a.length === b.length && a.every((x, i) => x === b[i])
}

// Classificados na ordem cross-group [1ºG1, 1ºG2, …, 2ºG1, 2ºG2, …].
function computeQualifierIds(champ: LocalChampionship, groupMatches: LocalMatch[]): string[] {
  const groups = champ.groups ?? []

  const pickFromGroup = (g: LocalGroup, pos: number): string | null => {
    const ids = new Set(g.participantIds)
    const standings = computeStandings(
      groupMatches
        .filter((m) => m.groupId === g.id)
        .map((m) => ({ side_a_participant_id: m.sideA, side_b_participant_id: m.sideB, games: m.games })),
      champ.participants.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, name: p.name })),
      champ.stage,
      champ.champ,
    )
    return standings[pos]?.participant_id ?? null
  }

  const maxQ = Math.max(0, ...groups.map((g) => qualifiersPerGroup(g.participantIds.length)))
  const known = new Set(champ.participants.map((p) => p.id))
  const out: string[] = []
  for (let pos = 0; pos < maxQ; pos++) {
    for (const g of groups) {
      if (pos >= qualifiersPerGroup(g.participantIds.length)) continue
      const pid = pickFromGroup(g, pos)
      if (pid && known.has(pid)) out.push(pid)
    }
  }
  return out
}

// ── CRUD IndexedDB ─────────────────────────────────────────────────────────
export async function getLocalChampionship(tempId: string): Promise<LocalChampionship | null> {
  return ((await get(keyFor(tempId))) as LocalChampionship | undefined) ?? null
}

export async function saveLocalChampionship(champ: LocalChampionship): Promise<void> {
  await set(keyFor(champ.tempId), champ)
}

export async function removeLocalChampionship(tempId: string): Promise<void> {
  await del(keyFor(tempId))
}

/**
 * Altera o campeonato numa única transação (ler + gravar juntos): toques
 * rápidos e o fechamento da partida não sobrescrevem um ao outro.
 */
export async function mutateLocalChampionship(
  tempId: string,
  fn: (champ: LocalChampionship) => void,
): Promise<LocalChampionship | null> {
  let result: LocalChampionship | null = null
  await update<LocalChampionship | undefined>(keyFor(tempId), (old) => {
    if (!old) return old
    fn(old)
    result = old
    return old
  })
  return result
}

export async function updateLocalMatch(
  tempId: string,
  matchId: string,
  patch: Partial<LocalMatch>,
): Promise<LocalChampionship | null> {
  return mutateLocalChampionship(tempId, (champ) => {
    champ.matches = champ.matches.map((m) => (m.id === matchId ? { ...m, ...patch } : m))
  })
}

// ── Adaptador para o cálculo de classificação (computeStandings) ─────────────
export function toOfflineStandingsData(champ: LocalChampionship) {
  return {
    matches: champ.matches.map((m) => ({
      id: m.id,
      side_a_participant_id: m.sideA,
      side_b_participant_id: m.sideB,
      match_games: m.games,
    })),
    participants: champ.participants.map((p) => ({ id: p.id, name: p.name })),
    stage: champ.stage,
    champ: champ.champ,
  }
}

export function participantAvatarMap(champ: LocalChampionship): Record<string, string | null> {
  return Object.fromEntries(champ.participants.map((p) => [p.id, p.avatarUrl]))
}
