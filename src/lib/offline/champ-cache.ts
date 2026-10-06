// Cache da ESTRUTURA de um campeonato ou desafio real (criado online), para
// abrir os jogos e lançar placar OFFLINE.
//
// Atualizado em segundo plano (refreshChampCache): ao abrir o detalhe com
// internet (OfflineCacheRefresher) e na pré-carga (OfflinePreloader) dos
// campeonatos/desafios em aberto do usuário. Guarda o necessário para a lista
// de jogos, a tela de placar e a chave andar offline (avanço de vencedores).
//
// O motor de placar (useScoreEngine) cuida do placar em si (fila + sync).

import { get, keys, set } from 'idb-keyval'
import { createClient } from '@/utils/supabase/client'
import type { ChampCfg } from '@/lib/standings/compute'

export type CachedSide = { name: string | null; avatarUrl: string | null }

export type CachedMatch = {
  id: string
  round: number
  bracketSlot: number | null
  groupId: string | null
  status: string
  result: string | null
  isWo?: boolean
  isDoubleWo?: boolean
  sideA: CachedSide
  sideB: CachedSide
  /** ids dos participantes (null = vaga ainda não definida na chave) */
  sideAId?: string | null
  sideBId?: string | null
  /** próximo jogo da chave (vencedor avança) */
  winnerAdvancesTo?: string | null
  scheduledAt?: string | null
  games: { game_number: number; score_a: number; score_b: number }[]
  // config da fase desta partida (p/ o motor de placar)
  counting: string
  setsToPlay: number
  pointsPerSet: number
  winByTwo: boolean
  setDrawEnabled: boolean
  timeMinutes: number | null
}

export type CachedChamp = {
  id: string
  name: string
  format: string
  /** organizador/admin (pode tudo) */
  canManage: boolean
  matches: CachedMatch[]
  // ── v2 ──
  unit?: string
  groups?: { id: string; name: string }[]
  /** participantes do usuário (pode marcar os próprios jogos) */
  myParticipantIds?: string[]
  /** todos os lados conhecidos (p/ preencher vagas da chave offline) */
  sides?: Record<string, CachedSide>
  /** pontuação e desempate (classificação offline) */
  cfg?: ChampCfg
  /** desafio por times: time de cada participante */
  teams?: { id: string; name: string }[]
  teamOf?: Record<string, string>
  savedAt?: number
}

const key = (id: string) => `champ-cache:${id}`

export async function saveCachedChamp(c: CachedChamp): Promise<void> {
  await set(key(c.id), { ...c, savedAt: Date.now() })
}

export async function getCachedChamp(id: string): Promise<CachedChamp | null> {
  return ((await get(key(id))) as CachedChamp | undefined) ?? null
}

export type CachedChampSummary = {
  id: string
  name: string
  format: string
  matches: number
  finished: number
  savedAt: number | null
}

/** Campeonatos/desafios guardados no aparelho (shell offline), mais recentes primeiro. */
export async function listCachedChamps(): Promise<CachedChampSummary[]> {
  const ids = ((await keys()) as IDBValidKey[])
    .filter((k): k is string => typeof k === 'string' && k.startsWith('champ-cache:'))
  const out: CachedChampSummary[] = []
  for (const k of ids) {
    const c = (await get(k)) as CachedChamp | undefined
    if (!c) continue
    out.push({
      id: c.id,
      name: c.name,
      format: c.format,
      matches: c.matches.length,
      finished: c.matches.filter((m) => m.status === 'finalizado').length,
      savedAt: c.savedAt ?? null,
    })
  }
  return out.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
}

export async function getCachedMatch(
  champId: string,
  matchId: string,
): Promise<{ champ: CachedChamp; match: CachedMatch } | null> {
  const champ = await getCachedChamp(champId)
  if (!champ) return null
  const match = champ.matches.find((m) => m.id === matchId)
  if (!match) return null
  return { champ, match }
}

// ─── Atualização a partir do servidor ─────────────────────────────────────────

type StageRow = {
  id: string
  ordering: number
  counting: string
  sets_to_play: number
  points_per_set: number
  win_by_two: boolean
  set_draw_enabled: boolean
  time_minutes: number | null
  groups: { id: string; name: string; ordering: number }[] | null
}

type ChampRow = {
  id: string
  name: string
  format: string
  unit: string
  points_win: number
  points_draw: number
  points_loss: number
  tiebreakers: string[] | null
  championship_teams: { id: string; name: string; ordering: number }[] | null
  championship_stages: StageRow[] | null
  participants: {
    id: string
    championship_team_id: string | null
    participant_members: { user_id: string }[] | null
  }[] | null
  matches: {
    id: string
    stage_id: string | null
    group_id: string | null
    round: number | null
    bracket_slot: number | null
    status: string
    result: string | null
    is_wo: boolean | null
    is_double_wo: boolean | null
    scheduled_at: string | null
    side_a_participant_id: string | null
    side_b_participant_id: string | null
    winner_advances_to: string | null
    match_games: { game_number: number; score_a: number; score_b: number }[] | null
  }[] | null
}

/** Últimas atualizações por campeonato (evita repetir em navegações seguidas). */
const lastRefresh = new Map<string, number>()
const MIN_INTERVAL_MS = 2 * 60 * 1000

/**
 * Busca a estrutura completa e grava o cache. Silencioso: sem rede ou sem
 * permissão, mantém o cache anterior. Retorna o cache gravado (ou null).
 */
export async function refreshChampCache(
  id: string,
  opts: { force?: boolean } = {},
): Promise<CachedChamp | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
  const last = lastRefresh.get(id) ?? 0
  if (!opts.force && Date.now() - last < MIN_INTERVAL_MS) return null
  lastRefresh.set(id, Date.now())

  try {
    const supabase = createClient()
    const [{ data: champ, error }, { data: session }] = await Promise.all([
      supabase
        .from('championships')
        .select(
          `id, name, format, unit, points_win, points_draw, points_loss, tiebreakers,
           championship_teams(id, name, ordering),
           championship_stages(id, ordering, counting, sets_to_play, points_per_set, win_by_two, set_draw_enabled, time_minutes, groups(id, name, ordering)),
           participants(id, championship_team_id, participant_members(user_id)),
           matches(id, stage_id, group_id, round, bracket_slot, status, result, is_wo, is_double_wo, scheduled_at,
                   side_a_participant_id, side_b_participant_id, winner_advances_to,
                   match_games(game_number, score_a, score_b))`,
        )
        .eq('id', id)
        .maybeSingle(),
      supabase.auth.getSession(),
    ])
    if (error || !champ) return null
    const c = champ as unknown as ChampRow
    const userId = session.session?.user.id ?? null

    const parts = c.participants ?? []
    const userIds = [...new Set(parts.flatMap((p) => (p.participant_members ?? []).map((m) => m.user_id)))]
    const [{ data: profiles }, { data: canManage }] = await Promise.all([
      userIds.length
        ? supabase.from('profiles').select('id, full_name, avatar_url').in('id', userIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null; avatar_url: string | null }[] }),
      supabase.rpc('can_manage_championship', { _championship_id: id }),
    ])

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
    const sides: Record<string, CachedSide> = {}
    const mine: string[] = []
    const teamOf: Record<string, string> = {}
    for (const p of parts) {
      if (p.championship_team_id) teamOf[p.id] = p.championship_team_id
      const members = (p.participant_members ?? []).map((m) => m.user_id)
      const names = members.map((u) => profileById.get(u)?.full_name).filter(Boolean) as string[]
      sides[p.id] = {
        name: names.join(' / ') || null,
        avatarUrl: members.length === 1 ? (profileById.get(members[0])?.avatar_url ?? null) : null,
      }
      if (userId && members.includes(userId)) mine.push(p.id)
    }

    const stages = [...(c.championship_stages ?? [])].sort((a, b) => a.ordering - b.ordering)
    const stageById = new Map(stages.map((s) => [s.id, s]))
    const empty: CachedSide = { name: null, avatarUrl: null }

    const cached: CachedChamp = {
      id: c.id,
      name: c.name,
      format: c.format,
      unit: c.unit,
      canManage: !!canManage,
      myParticipantIds: mine,
      sides,
      cfg: {
        pointsWin: c.points_win,
        pointsDraw: c.points_draw,
        pointsLoss: c.points_loss,
        tiebreakers: c.tiebreakers ?? [],
      },
      teams: [...(c.championship_teams ?? [])]
        .sort((a, b) => a.ordering - b.ordering)
        .map((t) => ({ id: t.id, name: t.name })),
      teamOf,
      groups: stages
        .flatMap((s) => s.groups ?? [])
        .sort((a, b) => a.ordering - b.ordering)
        .map((g) => ({ id: g.id, name: g.name })),
      matches: (c.matches ?? []).map((m) => {
        const st = (m.stage_id && stageById.get(m.stage_id)) || stages[0]
        return {
          id: m.id,
          round: m.round ?? 1,
          bracketSlot: m.bracket_slot,
          groupId: m.group_id,
          status: m.status,
          result: m.result,
          isWo: !!m.is_wo,
          isDoubleWo: !!m.is_double_wo,
          sideAId: m.side_a_participant_id,
          sideBId: m.side_b_participant_id,
          sideA: m.side_a_participant_id ? (sides[m.side_a_participant_id] ?? empty) : empty,
          sideB: m.side_b_participant_id ? (sides[m.side_b_participant_id] ?? empty) : empty,
          winnerAdvancesTo: m.winner_advances_to,
          scheduledAt: m.scheduled_at,
          games: [...(m.match_games ?? [])].sort((a, b) => a.game_number - b.game_number),
          counting: st?.counting ?? 'set',
          setsToPlay: st?.sets_to_play ?? 3,
          pointsPerSet: st?.points_per_set ?? 11,
          winByTwo: st?.win_by_two ?? true,
          setDrawEnabled: st?.set_draw_enabled ?? false,
          timeMinutes: st?.time_minutes ?? null,
        }
      }),
    }
    await saveCachedChamp(cached)
    return cached
  } catch {
    return null
  }
}
