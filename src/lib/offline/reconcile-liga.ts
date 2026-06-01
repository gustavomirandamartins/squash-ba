'use client'

// Reconciliação: depois que um campeonato Liga criado offline é finalmente
// criado no servidor (runCreation), migra os placares lançados no snapshot
// local para as partidas REAIS, casando por (rodada + conjunto de membros dos
// lados). Best-effort: falha não recria o campeonato (idempotência manual).

import { set, get, del } from 'idb-keyval'
import { createClient } from '@/utils/supabase/client'
import type { LocalChampionship } from './local-championship'

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

  // 3. Para cada partida local com placar, casa e aplica
  for (const lm of snapshot.matches) {
    if (lm.games.length === 0) continue
    const laKey = lm.sideA ? (localKeyByPartId.get(lm.sideA) ?? '') : ''
    const lbKey = lm.sideB ? (localKeyByPartId.get(lm.sideB) ?? '') : ''
    const pairKey = [laKey, lbKey].sort().join('::')
    const real = realByKey.get(`${lm.round}#${pairKey}`)
    if (!real) continue

    // Orientação: se o lado A real == lado A local, mantém; senão inverte.
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
    if (gErr) throw new Error(gErr.message)

    if (lm.status === 'finalizado' && lm.result) {
      const result =
        lm.result === 'empate'
          ? 'empate'
          : swapped
            ? lm.result === 'lado_a' ? 'lado_b' : 'lado_a'
            : lm.result
      const { error: uErr } = await supabase
        .from('matches')
        .update({ status: 'finalizado', result })
        .eq('id', real.id)
      if (uErr) throw new Error(uErr.message)
    } else {
      await supabase.from('matches').update({ status: 'em_andamento' }).eq('id', real.id)
    }
  }
}
