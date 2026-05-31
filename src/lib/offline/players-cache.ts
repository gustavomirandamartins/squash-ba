// Cache offline do pool de jogadores + categorias (para os wizards de criação).
//
// Online: busca no Supabase e grava no IndexedDB (idb-keyval).
// Offline: lê o último snapshot gravado.
//
// Assim é possível montar duplas / selecionar participantes ao criar um
// campeonato ou desafio offline, desde que o app tenha sido aberto online ao
// menos uma vez (mesmo princípio do snapshot de páginas do service worker).

import { get, set } from 'idb-keyval'
import { createClient } from '@/utils/supabase/client'

export type CachedPlayer = {
  id: string
  full_name: string | null
  avatar_url: string | null
  category_id: string | null
}

export type CachedCategory = { id: string; name: string }

const PLAYERS_KEY = 'players-pool-cache'
const CATEGORIES_KEY = 'categories-cache'

// ── Categorias ────────────────────────────────────────────────────────────────

export async function loadCategories(): Promise<CachedCategory[]> {
  try {
    const { data, error } = await createClient()
      .from('categories')
      .select('id, name')
      .order('name')
    if (error || !data) throw error ?? new Error('sem dados')
    const cats = data as CachedCategory[]
    await set(CATEGORIES_KEY, cats)
    return cats
  } catch {
    return ((await get(CATEGORIES_KEY)) as CachedCategory[] | undefined) ?? []
  }
}

// ── Pool de jogadores ───────────────────────────────────────────────────────
// Busca TODO o pool (sem filtro por categoria) — o filtro é aplicado no cliente,
// o que mantém o cache utilizável offline com qualquer combinação de categorias.

export async function loadPlayerPool(): Promise<CachedPlayer[]> {
  try {
    const { data, error } = await createClient()
      .from('profiles')
      .select('id, full_name, avatar_url, category_id')
      .not('full_name', 'is', null)
      .order('full_name')
      .limit(300)
    if (error || !data) throw error ?? new Error('sem dados')
    const players = data as CachedPlayer[]
    await set(PLAYERS_KEY, players)
    return players
  } catch {
    return ((await get(PLAYERS_KEY)) as CachedPlayer[] | undefined) ?? []
  }
}
