import { createClient } from '@/utils/supabase/server'
import { WelcomeHeader } from '@/components/home/WelcomeHeader'
import { PwaInstallBanner } from '@/components/home/PwaInstallBanner'
import { Lembretes, type LembretesData } from '@/components/home/Lembretes'
import { SponsorBanner } from '@/components/home/SponsorBanner'
import { OngoingSection, type LiveMatch, type OngoingItem } from '@/components/home/OngoingSection'
import { CategoryRanking, type RankRow } from '@/components/home/CategoryRanking'
import { CommunityFeed } from '@/components/home/feed/CommunityFeed'
import type { FeedPost } from '@/components/home/feed/types'

const EPOCH = new Date(0).toISOString()

type InviteRow = {
  participants: {
    enrollment_status: string
    championships: { id: string; name: string; format: string; status: string }
  } | null
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Layout (app)/layout.tsx já garante autenticação; salvaguarda de tipo.
  if (!user) return null

  // ── Fase 1: consultas independentes em paralelo ───────────────────────────
  const [
    profileRes,
    membershipsRes,
    invitesRes,
    activeChampsRes,
    liveMatchesRes,
    myCreatedChallengesRes,
    rankingRes,
    sponsorsRes,
    sponsorLinksRes,
    feedRes,
    rolesRes,
  ] = await Promise.all([
    supabase.from('profiles').select('full_name, gender, birth_date, avatar_url').eq('id', user.id).single(),
    supabase.from('conversation_members').select('conversation_id, last_read_at').eq('user_id', user.id),
    supabase
      .from('participant_members')
      .select('participants!inner(enrollment_status, championships!inner(id, name, format, status))')
      .eq('user_id', user.id),
    supabase
      .from('championships')
      .select('id, name, format')
      .eq('status', 'ativo')
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('matches')
      .select('id, championship_id, side_a_participant_id, side_b_participant_id, championships(format)')
      .eq('status', 'em_andamento')
      .limit(6),
    // Desafios que EU criei e onde o convidado já respondeu (aceite ou recusa)
    // pendente = ainda sem resposta → não mostra lembrete ainda
    supabase
      .from('championships')
      .select('id, name, participants(enrollment_status, participant_members(user_id))')
      .eq('format', 'desafio')
      .eq('created_by', user.id)
      .in('status', ['rascunho', 'ativo']),
    supabase.rpc('get_rankings'),
    supabase.storage.from('sponsors').list('', { limit: 100, sortBy: { column: 'name', order: 'asc' } }),
    supabase.from('sponsor_banners').select('image_name, link_url'),
    // Feed da comunidade — 20 posts mais recentes + autor
    supabase
      .from('community_posts')
      .select('id, author_id, body, image_path, embed_url, embed_provider, created_at, profiles!community_posts_author_id_fkey(full_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('user_roles').select('role').eq('user_id', user.id),
  ])

  const firstName = (profileRes.data?.full_name ?? 'Jogador').trim().split(/\s+/)[0]
  const gender = profileRes.data?.gender ?? null

  // Verifica se hoje é o aniversário do usuário (compara dia e mês em UTC).
  const isBirthday = (() => {
    const bd = profileRes.data?.birth_date
    if (!bd) return false
    const today = new Date()
    const birth = new Date(bd)
    return today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() === birth.getUTCDate()
  })()

  // Deriva IDs/mapas da fase 1 (síncrono) para alimentar a fase 2.
  const memberships = (membershipsRes.data ?? []) as Array<{ conversation_id: string; last_read_at: string | null }>
  const myConvIds = memberships.map((m) => m.conversation_id)
  const lastReadMap = new Map(memberships.map((m) => [m.conversation_id, m.last_read_at ?? EPOCH]))

  const inviteRows = (invitesRes.data ?? []) as unknown as InviteRow[]
  const champInvites: { id: string; name: string }[] = []
  const challengeChampIds: string[] = []
  const challengeNames = new Map<string, string>()
  let activeCount = 0
  for (const row of inviteRows) {
    const part = row.participants
    const champ = part?.championships
    if (!part || !champ) continue
    if (part.enrollment_status === 'pendente') {
      if (champ.format === 'desafio') {
        challengeChampIds.push(champ.id)
        challengeNames.set(champ.id, champ.name)
      } else {
        champInvites.push({ id: champ.id, name: champ.name })
      }
    } else if (part.enrollment_status === 'confirmado' && champ.format !== 'desafio' && champ.status === 'ativo') {
      activeCount += 1
    }
  }

  const liveRaw = (liveMatchesRes.data ?? []) as unknown as Array<{
    id: string
    championship_id: string
    side_a_participant_id: string | null
    side_b_participant_id: string | null
    championships: { format: string } | { format: string }[] | null
  }>
  const sideIds = [
    ...new Set(liveRaw.flatMap((m) => [m.side_a_participant_id, m.side_b_participant_id].filter(Boolean) as string[])),
  ]

  // ── Fase 2: lookups dependentes, todos independentes entre si → em paralelo ─
  const emptyData = <T,>() => Promise.resolve({ data: [] as T })
  const [unreadRes, challengePartsRes, sidePartsRes] = await Promise.all([
    myConvIds.length
      ? supabase.from('messages').select('conversation_id, created_at').in('conversation_id', myConvIds).neq('sender_id', user.id)
      : emptyData<Array<{ conversation_id: string; created_at: string }>>(),
    challengeChampIds.length
      ? supabase.from('participants').select('championship_id, participant_members(user_id)').in('championship_id', challengeChampIds)
      : emptyData<Array<{ championship_id: string; participant_members: { user_id: string }[] }>>(),
    sideIds.length
      ? supabase.from('participants').select('id, display_name').in('id', sideIds)
      : emptyData<Array<{ id: string; display_name: string | null }>>(),
  ])

  // Não lidas: 1 query + redução em JS contra o last_read_at por conversa.
  const unread = ((unreadRes.data ?? []) as Array<{ conversation_id: string; created_at: string }>).filter(
    (m) => m.created_at > (lastReadMap.get(m.conversation_id) ?? EPOCH),
  ).length

  // Desafiante de cada convite (o outro participante) → precisa de +1 query (fase 3).
  const challengeParts = (challengePartsRes.data ?? []) as Array<{
    championship_id: string
    participant_members: { user_id: string }[]
  }>
  const champToOther = new Map<string, string>()
  for (const p of challengeParts) {
    for (const pm of p.participant_members ?? []) {
      if (pm.user_id !== user.id && !champToOther.has(p.championship_id)) {
        champToOther.set(p.championship_id, pm.user_id)
      }
    }
  }
  const otherIds = [...new Set([...champToOther.values()])]
  const { data: otherProfiles } = otherIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', otherIds)
    : { data: [] }
  const nameById = new Map((otherProfiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))

  const challengeInvites = challengeChampIds.map((id) => {
    const otherId = champToOther.get(id)
    return {
      id,
      name: challengeNames.get(id) ?? 'Desafio',
      challenger: otherId ? (nameById.get(otherId) ?? null) : null,
    }
  })

  // Desafios criados por mim com resposta do convidado (aceite ou recusa recente).
  type CreatedChallenge = {
    id: string
    name: string
    participants: Array<{
      enrollment_status: string
      participant_members: Array<{ user_id: string }>
    }>
  }
  const myCreatedChallenges = (myCreatedChallengesRes.data ?? []) as unknown as CreatedChallenge[]
  const challengeResponses: { id: string; name: string; responderName: string | null; accepted: boolean }[] = []
  const responderIds: string[] = []
  const responseInfoMap = new Map<string, { accepted: boolean; responderId: string }>()
  for (const champ of myCreatedChallenges) {
    // O participante convidado (não é o criador) que já respondeu
    const guestPart = champ.participants.find((p) => {
      const members = p.participant_members ?? []
      const isNotMe = members.some((m) => m.user_id !== user.id)
      return isNotMe && p.enrollment_status !== 'pendente'
    })
    if (!guestPart) continue
    const responderId = guestPart.participant_members.find((m) => m.user_id !== user.id)?.user_id
    if (!responderId) continue
    responderIds.push(responderId)
    responseInfoMap.set(champ.id, {
      accepted: guestPart.enrollment_status === 'confirmado',
      responderId,
    })
  }
  const { data: responderProfiles } = responderIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', [...new Set(responderIds)])
    : { data: [] }
  const responderNameById = new Map(
    (responderProfiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]),
  )
  for (const champ of myCreatedChallenges) {
    const info = responseInfoMap.get(champ.id)
    if (!info) continue
    challengeResponses.push({
      id: champ.id,
      name: champ.name,
      responderName: responderNameById.get(info.responderId) ?? null,
      accepted: info.accepted,
    })
  }

  const lembretes: LembretesData = { unread, champInvites, challengeInvites, challengeResponses, activeCount, isBirthday }

  // ── Acontecendo agora ─────────────────────────────────────────────────────
  const partName = new Map(
    ((sidePartsRes.data ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [p.id, p.display_name]),
  )
  const activeItems: OngoingItem[] = (activeChampsRes.data ?? []).map(
    (c: { id: string; name: string; format: string }) => {
      const isChallenge = c.format === 'desafio'
      return { id: c.id, name: c.name, isChallenge, href: isChallenge ? `/desafios/${c.id}` : `/campeonatos/${c.id}` }
    },
  )
  const champNameById = new Map(activeItems.map((c) => [c.id, c.name]))

  const liveMatches: LiveMatch[] = liveRaw.map((m) => {
    const champ = Array.isArray(m.championships) ? m.championships[0] : m.championships
    const isChallenge = champ?.format === 'desafio'
    return {
      id: m.id,
      href: isChallenge ? `/desafios/${m.championship_id}` : `/campeonatos/${m.championship_id}`,
      a: (m.side_a_participant_id ? partName.get(m.side_a_participant_id) : null) ?? 'A definir',
      b: (m.side_b_participant_id ? partName.get(m.side_b_participant_id) : null) ?? 'A definir',
      champName: champNameById.get(m.championship_id) ?? 'Partida',
    }
  })

  // ── Ranking geral (nova RPC get_rankings) ────────────────────────────────
  const rankRows: RankRow[] = ((rankingRes.data ?? []) as Array<{
    user_id: string
    full_name: string | null
    avatar_url: string | null
    category_id: string | null
    category_name: string | null
    points: number
    game_points: number
    bonus_points: number
    wins: number
    losses: number
    played: number
    set_balance: number
    rank: number
  }>).map((r) => ({
    user_id: r.user_id,
    full_name: r.full_name,
    avatar_url: r.avatar_url,
    category_id: r.category_id,
    category_name: r.category_name,
    points: r.points,
    game_points: r.game_points,
    bonus_points: r.bonus_points,
    wins: r.wins,
    losses: r.losses,
    played: r.played,
    set_balance: r.set_balance,
    rank: Number(r.rank),
  }))

  // ── Banner do patrocinador (todos os do bucket; carrossel rotaciona no client) ─
  const linkByName = new Map(
    ((sponsorLinksRes.data ?? []) as Array<{ image_name: string; link_url: string | null }>).map((r) => [
      r.image_name,
      r.link_url,
    ]),
  )
  const banners = (sponsorsRes.data ?? [])
    .filter((f) => f.name && !f.name.startsWith('.'))
    .map((f) => ({
      src: supabase.storage.from('sponsors').getPublicUrl(f.name).data.publicUrl,
      href: linkByName.get(f.name) ?? null,
    }))

  // ── Feed da comunidade ─────────────────────────────────────────────────────
  const feedPosts: FeedPost[] = ((feedRes.data ?? []) as unknown as Array<{
    id: string
    author_id: string
    body: string | null
    image_path: string | null
    embed_url: string | null
    embed_provider: FeedPost['embed_provider']
    created_at: string
    profiles: { full_name: string | null; avatar_url: string | null } | { full_name: string | null; avatar_url: string | null }[] | null
  }>).map((row) => {
    const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
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
      author_name: prof?.full_name ?? null,
      author_avatar: prof?.avatar_url ?? null,
    }
  })
  const isAdmin = ((rolesRes.data ?? []) as Array<{ role: string }>).some((r) => r.role === 'admin')

  // ── Render ────────────────────────────────────────────────────────────────
  const sections = [
    <WelcomeHeader key="welcome" firstName={firstName} gender={gender} />,
    <PwaInstallBanner key="pwa-install" />,
    <Lembretes key="lembretes" data={lembretes} />,
    <SponsorBanner key="sponsor" banners={banners} />,
    <OngoingSection key="ongoing" liveMatches={liveMatches} active={activeItems} />,
    <CategoryRanking key="ranking" rows={rankRows} />,
    <CommunityFeed
      key="community"
      posts={feedPosts}
      currentUserId={user.id}
      currentUserName={profileRes.data?.full_name ?? null}
      currentUserAvatar={profileRes.data?.avatar_url ?? null}
      isAdmin={isAdmin}
    />,
  ]

  return (
    <div className="flex flex-col gap-6 pt-2">
      {sections.map((node, i) => (
        <div key={node.key} className="reveal" style={{ animationDelay: `${40 + i * 70}ms` }}>
          {node}
        </div>
      ))}
    </div>
  )
}
