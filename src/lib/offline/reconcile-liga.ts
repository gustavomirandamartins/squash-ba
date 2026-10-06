'use client'

// Reconciliação: depois que um campeonato Liga criado offline é finalmente
// criado no servidor (runCreation), migra os placares lançados no snapshot
// local para as partidas REAIS, casando por (rodada + conjunto de membros dos
// lados). Best-effort: falha não recria o campeonato (idempotência manual).

import { set, get, del } from 'idb-keyval'
import { createClient } from '@/utils/supabase/client'
import type { LocalChampionship } from './local-championship'
import type { StageCfg } from '@/lib/standings/compute'

const syncedKey = (tempId: string) => `local-synced:${tempId}`

/** Guarda o mapeamento tempId → id real (a tela provisória usa p/ redirecionar). */
export async function markLocalSynced(tempId: string, realId: string): Promise<void> {
  await set(syncedKey(tempId), realId)
}

/** Lê e consome o mapeamento tempId → id real, se existir. */
export async function takeLocalSynced(tempId: string): Promise<string | null> {
  const realId = (await get(syncedKey(tempId))) as string | undefined
  if (realId) await del(syncedKey(tempId))
  return realId ?? null
}

function memberKey(userIds: string[]): string {
  return [...userIds].sort().join('|')
}

/**
 * Partida por TEMPO encerrada no provisório: o servidor só a finaliza com
 * `duration_seconds` preenchido (resolve_match). Grava a duração ANTES do placar
 * — o upsert dos games dispara o trigger que finaliza. O provisório não tem
 * cronômetro, então a duração fica 0.
 */
async function markTempoFinished(
  supabase: ReturnType<typeof createClient>,
  realMatchId: string,
  stage: StageCfg | undefined,
  local: LocalChampionship['matches'][number],
): Promise<void> {
  if (stage?.counting !== 'tempo' || local.status !== 'finalizado') return
  const { error } = await supabase
    .from('matches')
    .update({ duration_seconds: 0 })
    .eq('id', realMatchId)
    .is('duration_seconds', null)
  if (error) throw new Error(`duração: ${error.message}`)
}

export async function reconcileLocalLiga(
  realChampId: string,
  snapshot: LocalChampionship,
): Promise<void> {
  const supabase = createClient()

  // 1. Participantes reais + membros
  const { data: realParts, error: pErr } = await supabase
    .from('participants')
    .select('id, participant_members(user_id)')
    .eq('championship_id', realChampId)
    .eq('enrollment_status', 'confirmado')
  if (pErr || !realParts) throw new Error(pErr?.message ?? 'Participantes reais não encontrados')

  const realIdByMemberKey = new Map<string, string>()
  const memberKeyByRealId = new Map<string, string>()
  for (const p of realParts) {
    const ids = (p.participant_members ?? []).map((m: { user_id: string }) => m.user_id)
    const k = memberKey(ids)
    realIdByMemberKey.set(k, p.id)
    memberKeyByRealId.set(p.id, k)
  }

  // 2. Partidas reais
  const { data: realMatches, error: mErr } = await supabase
    .from('matches')
    .select('id, round, side_a_participant_id, side_b_participant_id')
    .eq('championship_id', realChampId)
  if (mErr || !realMatches) throw new Error(mErr?.message ?? 'Partidas reais não encontradas')

  // memberKey local por id de participante local
  const localKeyByPartId = new Map(
    snapshot.participants.map((p) => [p.id, memberKey(p.userIds)]),
  )

  // índice das partidas reais por rodada + par (não ordenado) de memberKeys
  const realByKey = new Map<string, { id: string; aKey: string; bKey: string }>()
  for (const rm of realMatches) {
    const aKey = rm.side_a_participant_id ? (memberKeyByRealId.get(rm.side_a_participant_id) ?? '') : ''
    const bKey = rm.side_b_participant_id ? (memberKeyByRealId.get(rm.side_b_participant_id) ?? '') : ''
    const pairKey = [aKey, bKey].sort().join('::')
    realByKey.set(`${rm.round}#${pairKey}`, { id: rm.id, aKey, bKey })
  }

  // 3. Para cada partida local com placar, casa e faz upsert dos games.
  // O trigger match_games_resolve finaliza a partida (status/result) sozinho —
  // exatamente como no fluxo online — então NÃO atualizamos matches manualmente.
  let matched = 0
  for (const lm of snapshot.matches) {
    if (lm.games.length === 0) continue
    const laKey = lm.sideA ? (localKeyByPartId.get(lm.sideA) ?? '') : ''
    const lbKey = lm.sideB ? (localKeyByPartId.get(lm.sideB) ?? '') : ''
    const pairKey = [laKey, lbKey].sort().join('::')
    const real = realByKey.get(`${lm.round}#${pairKey}`)
    if (!real) continue

    // Orientação: se o lado A real == lado A local, mantém; senão inverte placar.
    await markTempoFinished(supabase, real.id, snapshot.stage, lm)
    const swapped = real.aKey !== laKey
    const gameRows = lm.games.map((g) => ({
      match_id: real.id,
      game_number: g.game_number,
      score_a: swapped ? g.score_b : g.score_a,
      score_b: swapped ? g.score_a : g.score_b,
    }))
    const { error: gErr } = await supabase
      .from('match_games')
      .upsert(gameRows, { onConflict: 'match_id,game_number' })
    if (gErr) throw new Error(`match_games: ${gErr.message}`)
    matched++
  }

  // Se havia placares mas nada casou, o mapeamento falhou → erro (não silencioso).
  const hadScores = snapshot.matches.some((m) => m.games.length > 0)
  if (hadScores && matched === 0) {
    throw new Error('nenhuma partida correspondente encontrada no servidor')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliação de ELIMINATÓRIA e GRUPOS+ELIM
// ─────────────────────────────────────────────────────────────────────────────

type RealMatchRow = {
  id: string
  round: number | null
  bracket_slot: number | null
  side_a_participant_id: string | null
  side_b_participant_id: string | null
}

function pairKey(aKey: string, bKey: string): string {
  return [aKey, bKey].sort().join('::')
}

// member key (conjunto de user_ids) por id de participante REAL.
async function loadRealParticipantKeys(
  supabase: ReturnType<typeof createClient>,
  realChampId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('participants')
    .select('id, participant_members(user_id)')
    .eq('championship_id', realChampId)
    .eq('enrollment_status', 'confirmado')
  if (error || !data) throw new Error(error?.message ?? 'participantes reais não encontrados')
  const map = new Map<string, string>()
  for (const p of data) {
    const ids = (p.participant_members ?? []).map((m: { user_id: string }) => m.user_id)
    map.set(p.id, memberKey(ids))
  }
  return map
}

// Faz upsert dos games de cada local match na real correspondente (casada por
// par-de-membros). `reals` já deve conter só candidatas com ambos os lados
// preenchidos e par-de-membros único no conjunto. Orientação A/B detectada.
async function upsertByPair(
  supabase: ReturnType<typeof createClient>,
  locals: LocalChampionship['matches'],
  localKeyByPart: Map<string, string>,
  reals: RealMatchRow[],
  realKeyByPart: Map<string, string>,
  stage: StageCfg | undefined,
): Promise<number> {
  const realByPair = new Map<string, { id: string; aKey: string }>()
  for (const rm of reals) {
    if (!rm.side_a_participant_id || !rm.side_b_participant_id) continue
    const aKey = realKeyByPart.get(rm.side_a_participant_id) ?? ''
    const bKey = realKeyByPart.get(rm.side_b_participant_id) ?? ''
    realByPair.set(pairKey(aKey, bKey), { id: rm.id, aKey })
  }
  let matched = 0
  for (const lm of locals) {
    if (lm.games.length === 0) continue
    const laKey = lm.sideA ? localKeyByPart.get(lm.sideA) ?? '' : ''
    const lbKey = lm.sideB ? localKeyByPart.get(lm.sideB) ?? '' : ''
    const real = realByPair.get(pairKey(laKey, lbKey))
    if (!real) continue
    await markTempoFinished(supabase, real.id, stage, lm)
    const swapped = real.aKey !== laKey
    const rows = lm.games.map((g) => ({
      match_id: real.id,
      game_number: g.game_number,
      score_a: swapped ? g.score_b : g.score_a,
      score_b: swapped ? g.score_a : g.score_b,
    }))
    const { error } = await supabase
      .from('match_games')
      .upsert(rows, { onConflict: 'match_id,game_number' })
    if (error) throw new Error(`match_games: ${error.message}`)
    matched++
  }
  return matched
}

// Reconciliação do BRACKET — sequencial por rodada. Após o upsert de cada rodada,
// o trigger do servidor finaliza a partida e propaga o vencedor para a próxima
// rodada (síncrono), então refazemos o fetch antes de casar a rodada seguinte.
// `bracketMatches` são as partidas locais com bracketSlot > 0.
async function reconcileBracket(
  supabase: ReturnType<typeof createClient>,
  realChampId: string,
  localKeyByPart: Map<string, string>,
  realKeyByPart: Map<string, string>,
  bracketMatches: LocalChampionship['matches'],
  stage: StageCfg | undefined,
): Promise<number> {
  const scored = bracketMatches.filter((m) => m.games.length > 0)
  if (scored.length === 0) return 0
  const rounds = [...new Set(scored.map((m) => m.round))].sort((a, b) => a - b)
  let total = 0
  for (const round of rounds) {
    const { data, error } = await supabase
      .from('matches')
      .select('id, round, bracket_slot, side_a_participant_id, side_b_participant_id')
      .eq('championship_id', realChampId)
      .gt('bracket_slot', 0)
    if (error || !data) throw new Error(error?.message ?? 'partidas (bracket) não encontradas')
    const realsThisRound = (data as RealMatchRow[]).filter((r) => (r.round ?? 0) === round)
    const localsThisRound = scored.filter((m) => m.round === round)
    total += await upsertByPair(supabase, localsThisRound, localKeyByPart, realsThisRound, realKeyByPart, stage)
  }
  return total
}

export async function reconcileLocalBracket(
  realChampId: string,
  snapshot: LocalChampionship,
): Promise<void> {
  const supabase = createClient()
  const realKeyByPart = await loadRealParticipantKeys(supabase, realChampId)
  const localKeyByPart = new Map(snapshot.participants.map((p) => [p.id, memberKey(p.userIds)]))
  const bracket = snapshot.matches.filter((m) => (m.bracketSlot ?? 0) > 0)
  const matched = await reconcileBracket(supabase, realChampId, localKeyByPart, realKeyByPart, bracket, snapshot.stage)

  const hadScores = bracket.some((m) => m.games.length > 0)
  if (hadScores && matched === 0) {
    throw new Error('nenhuma partida do bracket correspondente no servidor')
  }
}

export async function reconcileLocalGrupos(
  realChampId: string,
  snapshot: LocalChampionship,
): Promise<void> {
  const supabase = createClient()
  const realKeyByPart = await loadRealParticipantKeys(supabase, realChampId)
  const localKeyByPart = new Map(snapshot.participants.map((p) => [p.id, memberKey(p.userIds)]))

  // ── Fase 1: jogos de grupos (bracket_slot null) ──
  // O round local (ciclo) ≠ round global do servidor; e o par-de-membros é único
  // por grupo. Casamos por par-de-membros + zip por ordem (cobre rounds > 1).
  const localGroupMatches = snapshot.matches.filter((m) => m.phase === 'grupos' && m.games.length > 0)

  const { data: realGroupRows, error: gErr } = await supabase
    .from('matches')
    .select('id, round, bracket_slot, side_a_participant_id, side_b_participant_id')
    .eq('championship_id', realChampId)
    .is('bracket_slot', null)
  if (gErr || !realGroupRows) throw new Error(gErr?.message ?? 'jogos de grupos não encontrados')

  // Agrupa por par-de-membros, ordena por round e faz zip local↔real.
  const realByPair = new Map<string, { id: string; aKey: string; round: number }[]>()
  for (const rm of realGroupRows as RealMatchRow[]) {
    if (!rm.side_a_participant_id || !rm.side_b_participant_id) continue
    const aKey = realKeyByPart.get(rm.side_a_participant_id) ?? ''
    const bKey = realKeyByPart.get(rm.side_b_participant_id) ?? ''
    const k = pairKey(aKey, bKey)
    const arr = realByPair.get(k) ?? []
    arr.push({ id: rm.id, aKey, round: rm.round ?? 0 })
    realByPair.set(k, arr)
  }
  for (const arr of realByPair.values()) arr.sort((a, b) => a.round - b.round)

  const localByPair = new Map<string, LocalChampionship['matches']>()
  for (const lm of localGroupMatches) {
    const laKey = lm.sideA ? localKeyByPart.get(lm.sideA) ?? '' : ''
    const lbKey = lm.sideB ? localKeyByPart.get(lm.sideB) ?? '' : ''
    const k = pairKey(laKey, lbKey)
    const arr = localByPair.get(k) ?? []
    arr.push(lm)
    localByPair.set(k, arr)
  }
  for (const arr of localByPair.values()) arr.sort((a, b) => a.round - b.round)

  let matchedGroups = 0
  for (const [k, locals] of localByPair) {
    const reals = realByPair.get(k) ?? []
    for (let i = 0; i < locals.length; i++) {
      const lm = locals[i]
      const real = reals[i]
      if (!real || lm.games.length === 0) continue
      await markTempoFinished(supabase, real.id, snapshot.stage, lm)
      const laKey = lm.sideA ? localKeyByPart.get(lm.sideA) ?? '' : ''
      const swapped = real.aKey !== laKey
      const rows = lm.games.map((g) => ({
        match_id: real.id,
        game_number: g.game_number,
        score_a: swapped ? g.score_b : g.score_a,
        score_b: swapped ? g.score_a : g.score_b,
      }))
      const { error } = await supabase
        .from('match_games')
        .upsert(rows, { onConflict: 'match_id,game_number' })
      if (error) throw new Error(`match_games (grupos): ${error.message}`)
      matchedGroups++
    }
  }

  const hadGroupScores = localGroupMatches.length > 0
  if (hadGroupScores && matchedGroups === 0) {
    throw new Error('nenhum jogo de grupo correspondente no servidor')
  }

  // ── Fase 2: bracket (o último jogo de grupo finalizado dispara a geração
  // do bracket no servidor via trg_auto_generate_bracket). ──
  const bracket = snapshot.matches.filter((m) => (m.bracketSlot ?? 0) > 0)
  if (bracket.some((m) => m.games.length > 0)) {
    await reconcileBracket(supabase, realChampId, localKeyByPart, realKeyByPart, bracket, snapshot.elimStage ?? snapshot.stage)
  }
}
