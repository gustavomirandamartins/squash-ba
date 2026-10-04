// Cache da ESTRUTURA de um campeonato real (criado online), para permitir abrir
// os jogos e lançar placar OFFLINE. Gravado quando o detalhe é aberto online.
//
// O motor de placar (useScoreEngine) já funciona offline para partidas reais
// (enfileira e sincroniza ao reconectar); aqui só guardamos o necessário para
// RENDERIZAR a tela de placar e a lista de jogos sem rede.

import { get, set } from 'idb-keyval'

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
  canManage: boolean
  matches: CachedMatch[]
}

const key = (id: string) => `champ-cache:${id}`

export async function saveCachedChamp(c: CachedChamp): Promise<void> {
  await set(key(c.id), c)
}

export async function getCachedChamp(id: string): Promise<CachedChamp | null> {
  return ((await get(key(id))) as CachedChamp | undefined) ?? null
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
