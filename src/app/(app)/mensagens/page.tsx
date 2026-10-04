import { redirect } from 'next/navigation'
import { createClient, getAuthUser } from '@/utils/supabase/server'
import { ConversationList, type ConvItem } from '@/components/mensagens/ConversationList'

export const metadata = { title: 'Mensagens' }

export default async function MensagensPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  // Memberships do usuário
  const { data: memberships } = await supabase
    .from('conversation_members')
    .select('conversation_id, last_read_at')
    .eq('user_id', user.id)

  const convIds = (memberships ?? []).map((m: { conversation_id: string }) => m.conversation_id)
  const readMap = new Map(
    (memberships ?? []).map((m: { conversation_id: string; last_read_at: string | null }) => [m.conversation_id, m.last_read_at]),
  )

  if (convIds.length === 0) {
    return <ConversationList initialConversations={[]} currentUserId={user.id} />
  }

  // Conversas
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, kind, title, championship_id')
    .in('id', convIds)

  // Último message por conversa
  const msgResults = await Promise.all(
    convIds.map((cid: string) =>
      supabase
        .from('messages')
        .select('body, created_at, sender_id')
        .eq('conversation_id', cid)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
        .then((r) => ({ cid, msg: r.data as { body: string; created_at: string; sender_id: string } | null })),
    ),
  )
  const lastMsgMap = new Map(msgResults.map(({ cid, msg }) => [cid, msg]))

  // Outro membro em 1:1
  const directIds = (convs ?? [])
    .filter((c: { kind: string }) => c.kind === 'direct')
    .map((c: { id: string }) => c.id)

  const { data: otherMembers } = directIds.length
    ? await supabase
        .from('conversation_members')
        .select('conversation_id, user_id')
        .in('conversation_id', directIds)
        .neq('user_id', user.id)
    : { data: [] }

  const otherUserIds = [...new Set((otherMembers ?? []).map((m: { user_id: string }) => m.user_id))]
  const { data: profiles } = otherUserIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', otherUserIds)
    : { data: [] }

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => [p.id, p]),
  )
  const otherMap = new Map(
    (otherMembers ?? []).map((m: { conversation_id: string; user_id: string }) => [m.conversation_id, m.user_id]),
  )

  const items: ConvItem[] = (convs ?? []).map((c: { id: string; kind: string; title: string | null; championship_id: string | null }) => {
    const lastMsg = lastMsgMap.get(c.id)
    const lastReadAt = readMap.get(c.id)
    const otherUid = c.kind === 'direct' ? (otherMap.get(c.id) ?? null) : null
    const otherProfile = otherUid ? (profileMap.get(otherUid) ?? null) : null

    const unread =
      lastMsg && lastMsg.sender_id !== user.id && lastReadAt
        ? lastMsg.created_at > lastReadAt
          ? 1
          : 0
        : 0

    return {
      id: c.id,
      kind: c.kind as 'direct' | 'group',
      title: c.title,
      championshipId: c.championship_id,
      lastMessageBody: lastMsg?.body ?? null,
      lastMessageAt: lastMsg?.created_at ?? null,
      unreadCount: unread,
      otherUserId: otherUid,
      otherUserName: otherProfile?.full_name ?? null,
      otherUserAvatar: (otherProfile as { avatar_url?: string | null } | null)?.avatar_url ?? null,
    }
  })

  items.sort((a, b) => {
    const ta = a.lastMessageAt ?? '0'
    const tb = b.lastMessageAt ?? '0'
    return tb > ta ? 1 : -1
  })

  return <ConversationList initialConversations={items} currentUserId={user.id} />
}
