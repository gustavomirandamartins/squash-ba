// Seções da Home que buscam os próprios dados (server components).
//
// Cada uma fica num <Suspense> na página: o topo aparece na hora e o resto
// chega quando fica pronto, sem uma seção lenta (ranking, feed) segurar as
// outras. Os nomes de jogadores vêm no mesmo join (participant_members →
// profiles), sem rodadas extras.

import { createClient } from '@/utils/supabase/server'
import { Lembretes, type LembretesData } from '@/components/home/Lembretes'
import { SponsorBanner } from '@/components/home/SponsorBanner'
import { OngoingSection, type LiveMatch, type OngoingItem } from '@/components/home/OngoingSection'
import { CategoryRanking, type RankRow } from '@/components/home/CategoryRanking'
import { CommunityFeed } from '@/components/home/feed/CommunityFeed'
import type { FeedPost } from '@/components/home/feed/types'
import { getHomeRankings, getSponsorBanners } from '@/lib/cached-public-data'

// ── Nomes a partir do join participant_members(user_id, profiles(full_name)) ──

type Profileish = { full_name: string | null } | { full_name: string | null }[] | null
type MemberRow = { user_id: string; profiles?: Profileish }

const profileName = (p: Profileish | undefined) =>
  (Array.isArray(p) ? p[0]?.full_name : p?.full_name) ?? null

/** Jogador: nome completo. Dupla: primeiros nomes ("Ana / Bia"). */
function sideName(members: MemberRow[] | null | undefined): string | null {
  const names = (members ?? []).map((m) => profileName(m.profiles)).filter(Boolean) as string[]
  if (names.length === 0) return null
  return names.length === 1 ? names[0] : names.map((n) => n.trim().split(/\s+/)[0]).join(' / ')
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

// ── Lembretes ─────────────────────────────────────────────────────────────────

type InviteRow = {
  participants: {
    enrollment_status: string
    championships: {
      id: string
      name: string
      format: string
      status: string
      participants: { participant_members: MemberRow[] | null }[] | null
    } | null
  } | null
}

type CreatedChallenge = {
  id: string
  name: string
  participants: { enrollment_status: string; participant_members: MemberRow[] | null }[] | null
}

export async function LembretesSection({ userId, isBirthday }: { userId: string; isBirthday: boolean }) {
  const supabase = await createClient()
  const [unreadRes, invitesRes, createdRes] = await Promise.all([
    // Contado no banco (antes: todas as mensagens baixadas para contar aqui).
    supabase.rpc('get_unread_total'),
    // Meus convites/inscrições + o desafiante já com nome (join).
    supabase
      .from('participant_members')
      .select(
        `participants!inner(enrollment_status,
           championships!inner(id, name, format, status,
             participants(participant_members(user_id, profiles(full_name)))))`,
      )
      .eq('user_id', userId),
    // Desafios que EU criei: quem respondeu (aceite ou recusa), já com nome.
    supabase
      .from('championships')
      .select('id, name, participants(enrollment_status, participant_members(user_id, profiles(full_name)))')
      .eq('format', 'desafio')
      .eq('created_by', userId)
      .in('status', ['rascunho', 'ativo']),
  ])

  const champInvites: { id: string; name: string }[] = []
  const challengeInvites: { id: string; name: string; challenger: string | null }[] = []
  let activeCount = 0
  for (const row of (invitesRes.data ?? []) as unknown as InviteRow[]) {
    const part = row.participants
    const champ = part?.championships
    if (!part || !champ) continue
    if (part.enrollment_status === 'pendente') {
      if (champ.format === 'desafio') {
        // O desafiante: o membro de outro participante que não sou eu.
        const other = (champ.participants ?? [])
          .flatMap((p) => p.participant_members ?? [])
          .find((m) => m.user_id !== userId)
        challengeInvites.push({ id: champ.id, name: champ.name, challenger: other ? profileName(other.profiles) : null })
      } else {
        champInvites.push({ id: champ.id, name: champ.name })
      }
    } else if (part.enrollment_status === 'confirmado' && champ.format !== 'desafio' && champ.status === 'ativo') {
      activeCount += 1
    }
  }

  const challengeResponses: LembretesData['challengeResponses'] = []
  for (const champ of (createdRes.data ?? []) as unknown as CreatedChallenge[]) {
    // O participante convidado (não sou eu) que já respondeu.
    const guest = (champ.participants ?? []).find(
      (p) => p.enrollment_status !== 'pendente' && (p.participant_members ?? []).some((m) => m.user_id !== userId),
    )
    const responder = guest?.participant_members?.find((m) => m.user_id !== userId)
    if (!guest || !responder) continue
    challengeResponses.push({
      id: champ.id,
      name: champ.name,
      responderName: profileName(responder.profiles),
      accepted: guest.enrollment_status === 'confirmado',
    })
  }

  const data: LembretesData = {
    unread: (unreadRes.data as number | null) ?? 0,
    champInvites,
    challengeInvites,
    challengeResponses,
    activeCount,
    isBirthday,
  }
  return <Lembretes data={data} />
}

// ── Patrocinadores (dado público, em cache) ───────────────────────────────────

export async function SponsorSection() {
  const banners = await getSponsorBanners().catch(() => [])
  return <SponsorBanner banners={banners} />
}

// ── Acontecendo agora ─────────────────────────────────────────────────────────

type LiveRow = {
  id: string
  championship_id: string
  championships: { name: string; format: string } | { name: string; format: string }[] | null
  side_a: { participant_members: MemberRow[] | null } | { participant_members: MemberRow[] | null }[] | null
  side_b: { participant_members: MemberRow[] | null } | { participant_members: MemberRow[] | null }[] | null
}

export async function OngoingDataSection() {
  const supabase = await createClient()
  const [activeRes, liveRes] = await Promise.all([
    supabase
      .from('championships')
      .select('id, name, format')
      .eq('status', 'ativo')
      .order('created_at', { ascending: false })
      .limit(12),
    // Lados com nome no mesmo join (antes: participants.display_name, que
    // nunca é preenchido — a Home mostrava sempre "A definir").
    supabase
      .from('matches')
      .select(
        `id, championship_id, championships(name, format),
         side_a:participants!matches_side_a_participant_id_fkey(participant_members(user_id, profiles(full_name))),
         side_b:participants!matches_side_b_participant_id_fkey(participant_members(user_id, profiles(full_name)))`,
      )
      .eq('status', 'em_andamento')
      .limit(6),
  ])

  const active: OngoingItem[] = ((activeRes.data ?? []) as { id: string; name: string; format: string }[]).map((c) => {
    const isChallenge = c.format === 'desafio'
    return { id: c.id, name: c.name, isChallenge, href: isChallenge ? `/desafios/${c.id}` : `/campeonatos/${c.id}` }
  })

  const liveMatches: LiveMatch[] = ((liveRes.data ?? []) as unknown as LiveRow[]).map((m) => {
    const champ = one(m.championships)
    const isChallenge = champ?.format === 'desafio'
    return {
      id: m.id,
      href: isChallenge ? `/desafios/${m.championship_id}` : `/campeonatos/${m.championship_id}`,
      a: sideName(one(m.side_a)?.participant_members) ?? 'A definir',
      b: sideName(one(m.side_b)?.participant_members) ?? 'A definir',
      champName: champ?.name ?? 'Partida',
    }
  })

  return <OngoingSection liveMatches={liveMatches} active={active} />
}

// ── Ranking (em cache; invalidado quando uma partida termina) ─────────────────

export async function RankingSection() {
  const rows: RankRow[] = await getHomeRankings().catch(() => [])
  return <CategoryRanking rows={rows} />
}

// ── Feed da comunidade ────────────────────────────────────────────────────────

type FeedRow = {
  id: string
  author_id: string
  body: string | null
  image_path: string | null
  embed_url: string | null
  embed_provider: FeedPost['embed_provider']
  created_at: string
  author_name: string | null
  author_avatar: string | null
  like_count: number | string
  comment_count: number | string
  liked: boolean
}

export async function FeedSection({
  userId,
  userName,
  userAvatar,
}: {
  userId: string
  userName: string | null
  userAvatar: string | null
}) {
  const supabase = await createClient()
  const [feedRes, rolesRes] = await Promise.all([
    supabase.rpc('get_community_feed', { _limit: 20, _offset: 0 }),
    supabase.from('user_roles').select('role').eq('user_id', userId),
  ])

  const posts: FeedPost[] = ((feedRes.data ?? []) as unknown as FeedRow[]).map((row) => ({
    id: row.id,
    author_id: row.author_id,
    body: row.body,
    image_path: row.image_path,
    image_url: row.image_path
      ? supabase.storage.from('community').getPublicUrl(row.image_path).data.publicUrl
      : null,
    embed_url: row.embed_url,
    embed_provider: row.embed_provider,
    created_at: row.created_at,
    author_name: row.author_name,
    author_avatar: row.author_avatar,
    like_count: Number(row.like_count),
    comment_count: Number(row.comment_count),
    liked: row.liked,
  }))
  const isAdmin = ((rolesRes.data ?? []) as { role: string }[]).some((r) => r.role === 'admin')

  return (
    <CommunityFeed
      posts={posts}
      currentUserId={userId}
      currentUserName={userName}
      currentUserAvatar={userAvatar}
      isAdmin={isAdmin}
    />
  )
}
