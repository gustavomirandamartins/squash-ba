// Dados iguais para todos os usuários, guardados em cache no servidor.
//
// Ranking, patrocinadores, categorias e anúncios ativos eram recalculados em
// toda visita. Aqui ficam em cache (unstable_cache: o projeto não usa Cache
// Components) e são invalidados:
//   • categorias, anúncios e links de banner → revalidateTag nas ações que os
//     alteram (gestão / admin);
//   • ranking → a cada 2 min (as partidas terminam direto no banco, sem passar
//     pelo servidor do Next);
//   • imagens de patrocinador (enviadas pelo painel do Supabase) → a cada 10 min.
//
// Só no servidor: usa a chave de serviço, porque o cache é compartilhado e não
// pode depender do cookie de quem pediu. As consultas pegam apenas dados
// públicos (ex.: só anúncios ativos).

import { unstable_cache } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { RankRow } from '@/components/home/CategoryRanking'

export const CACHE_TAGS = {
  rankings: 'rankings',
  sponsors: 'sponsors',
  categories: 'categories',
  ads: 'ads',
} as const

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

type RankingRpcRow = Omit<RankRow, 'rank'> & { rank: number | string }

export const getHomeRankings = unstable_cache(
  async (): Promise<RankRow[]> => {
    const supabase = serviceClient()
    if (!supabase) return []
    const { data, error } = await supabase.rpc('get_rankings')
    if (error) throw error // não guarda resultado de erro
    return ((data ?? []) as RankingRpcRow[]).map((r) => ({ ...r, rank: Number(r.rank) }))
  },
  ['home-rankings'],
  { revalidate: 120, tags: [CACHE_TAGS.rankings] },
)

export type SponsorBannerItem = { src: string; href: string | null }

export const getSponsorBanners = unstable_cache(
  async (): Promise<SponsorBannerItem[]> => {
    const supabase = serviceClient()
    if (!supabase) return []
    const [files, links] = await Promise.all([
      supabase.storage.from('sponsors').list('', { limit: 100, sortBy: { column: 'name', order: 'asc' } }),
      supabase.from('sponsor_banners').select('image_name, link_url'),
    ])
    if (files.error) throw files.error
    const linkByName = new Map(
      ((links.data ?? []) as { image_name: string; link_url: string | null }[]).map((r) => [r.image_name, r.link_url]),
    )
    return (files.data ?? [])
      .filter((f) => f.name && !f.name.startsWith('.'))
      .map((f) => ({
        src: supabase.storage.from('sponsors').getPublicUrl(f.name).data.publicUrl,
        href: linkByName.get(f.name) ?? null,
      }))
  },
  ['sponsor-banners'],
  { revalidate: 600, tags: [CACHE_TAGS.sponsors] },
)

export type CategoryItem = { id: string; name: string }

export const getCategories = unstable_cache(
  async (): Promise<CategoryItem[]> => {
    const supabase = serviceClient()
    if (!supabase) return []
    const { data, error } = await supabase.from('categories').select('id, name').order('name')
    if (error) throw error
    return (data ?? []) as CategoryItem[]
  },
  ['categories'],
  { revalidate: 3600, tags: [CACHE_TAGS.categories] },
)

export type AdItem = {
  id: string
  name: string
  product_service: string | null
  phone: string | null
  email: string | null
  address: string | null
}

export const getActiveAds = unstable_cache(
  async (): Promise<AdItem[]> => {
    const supabase = serviceClient()
    if (!supabase) return []
    const { data, error } = await supabase
      .from('ads')
      .select('id, name, product_service, phone, email, address')
      .eq('active', true)
      .order('ordering', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as AdItem[]
  },
  ['active-ads'],
  { revalidate: 600, tags: [CACHE_TAGS.ads] },
)
