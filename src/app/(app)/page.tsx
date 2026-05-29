import { createClient } from '@/utils/supabase/server'
import { WelcomeHeader } from '@/components/home/WelcomeHeader'
import { Lembretes, type LembretesData } from '@/components/home/Lembretes'
import { SponsorBanner } from '@/components/home/SponsorBanner'
import { OngoingSection, type LiveMatch, type OngoingItem } from '@/components/home/OngoingSection'
import { TeachersSection, type Teacher } from '@/components/home/TeachersSection'
import { CategoryRanking, type RankCategory, type RankRow } from '@/components/home/CategoryRanking'

const EPOCH = new Date(0).toISOString()

// Rotação determinística do banner por usuário
function hashIndex(seed: string, length: number): number {
  if (length <= 0) return 0
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return Math.abs(h) % length
}

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
    organizersRes,
    rankingRes,
    sponsorsRes,
  ] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
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
    supabase.from('user_roles').select('user_id').eq('role', 'organizer'),
    supabase.rpc('get_category_rankings'),
    supabase.storage.from('sponsors').list('', { limit: 100, sortBy: { column: 'name', order: 'asc' } }),
  ])

  const firstName = (profileRes.data?.full_name ?? 'Jogador').trim().split(/\s+/)[0]

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

  const organizerIds = [
    ...new Set((organizersRes.data ?? []).map((r: { user_id: string }) => r.user_id).filter((id) => id !== user.id)),
  ]

  // ── Fase 2: lookups dependentes, todos independentes entre si → em paralelo ─
  const emptyData = <T,>() => Promise.resolve({ data: [] as T })
  const [unreadRes, challengePartsRes, sidePartsRes, teacherProfilesRes] = await Promise.all([
    myConvIds.length
      ? supabase.from('messages').select('conversation_id, created_at').in('conversation_id', myConvIds).neq('sender_id', user.id)
      : emptyData<Array<{ conversation_id: string; created_at: string }>>(),
    challengeChampIds.length
      ? supabase.from('participants').select('championship_id, participant_members(user_id)').in('championship_id', challengeChampIds)
      : emptyData<Array<{ championship_id: string; participant_members: { user_id: string }[] }>>(),
    sideIds.length
      ? supabase.from('participants').select('id, display_name').in('id', sideIds)
      : emptyData<Array<{ id: string; display_name: string | null }>>(),
    organizerIds.length
      ? supabase.from('profiles').select('id, full_name, avatar_url').in('id', organizerIds)
      : emptyData<Teacher[]>(),
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

  const lembretes: LembretesData = { unread, champInvites, challengeInvites, activeCount }

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

  // ── Professores (organizadores) ───────────────────────────────────────────
  const teachers: Teacher[] = (teacherProfilesRes.data ?? []) as Teacher[]

  // ── Ranking por categoria (agrupa linhas da RPC) ──────────────────────────
  const rankRows = (rankingRes.data ?? []) as Array<{
    category_id: string
    category_name: string
    user_id: string
    full_name: string | null
    avatar_url: string | null
    points: number
    wins: number
    played: number
    rank: number
  }>
  const catMap = new Map<string, RankCategory>()
  for (const r of rankRows) {
    if (!catMap.has(r.category_id)) {
      catMap.set(r.category_id, { id: r.category_id, name: r.category_name, rows: [] })
    }
    const row: RankRow = {
      user_id: r.user_id,
      full_name: r.full_name,
      avatar_url: r.avatar_url,
      points: r.points,
      wins: r.wins,
      played: r.played,
      rank: Number(r.rank),
    }
    catMap.get(r.category_id)!.rows.push(row)
  }
  const rankCategories = [...catMap.values()]

  // ── Banner do patrocinador (bucket público, rotação por usuário) ──────────
  const files = (sponsorsRes.data ?? []).filter((f) => f.name && !f.name.startsWith('.'))
  let sponsorSrc: string | null = null
  if (files.length > 0) {
    const pick = files[hashIndex(user.id, files.length)]
    sponsorSrc = supabase.storage.from('sponsors').getPublicUrl(pick.name).data.publicUrl
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const sections = [
    <WelcomeHeader key="welcome" firstName={firstName} />,
    <Lembretes key="lembretes" data={lembretes} />,
    <SponsorBanner key="sponsor" src={sponsorSrc} />,
    <OngoingSection key="ongoing" liveMatches={liveMatches} active={activeItems} />,
    <TeachersSection key="teachers" teachers={teachers} />,
    <CategoryRanking key="ranking" categories={rankCategories} />,
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
