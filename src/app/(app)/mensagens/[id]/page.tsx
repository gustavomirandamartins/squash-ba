import { notFound, redirect } from 'next/navigation'
import { createClient, getAuthUser } from '@/utils/supabase/server'
import { ChatView, type ChatMessage, type ConvMeta } from '@/components/mensagens/ChatView'

export const metadata = { title: 'Chat' }

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: convId } = await params
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  // Verifica que o user é membro
  const { data: membership } = await supabase
    .from('conversation_members')
    .select('id')
    .eq('conversation_id', convId)
    .eq('user_id', user.id)
    .single()

  if (!membership) notFound()

  // Conversa
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, kind, title, championship_id')
    .eq('id', convId)
    .single()

  if (!conv) notFound()

  // Outros membros (para 1:1 e para resolver nomes)
  const { data: allMembers } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', convId)

  const memberIds = (allMembers ?? []).map((m: { user_id: string }) => m.user_id)
  const { data: profiles } = memberIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', memberIds)
    : { data: [] }

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => [p.id, p]),
  )

  const otherUserId = conv.kind === 'direct'
    ? (memberIds.find((uid: string) => uid !== user.id) ?? null)
    : null
  const otherProfile = otherUserId ? (profileMap.get(otherUserId) ?? null) : null

  const convMeta: ConvMeta = {
    id: conv.id,
    kind: conv.kind as 'direct' | 'group',
    title: conv.title,
    otherUserName: otherProfile?.full_name ?? null,
    otherUserAvatar: (otherProfile as { avatar_url?: string | null } | null)?.avatar_url ?? null,
  }

  // Últimas 60 mensagens
  const { data: messagesRaw } = await supabase
    .from('messages')
    .select('id, sender_id, body, created_at')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true })
    .limit(60)

  const initialMessages: ChatMessage[] = (messagesRaw ?? []).map((m: {
    id: string
    sender_id: string
    body: string
    created_at: string
  }) => {
    const profile = profileMap.get(m.sender_id)
    return {
      id: m.id,
      senderId: m.sender_id,
      senderName: profile?.full_name ?? null,
      senderAvatar: (profile as { avatar_url?: string | null } | null)?.avatar_url ?? null,
      body: m.body,
      createdAt: m.created_at,
      isOwn: m.sender_id === user.id,
    }
  })

  // Marca como lido (SSR)
  await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', convId)
    .eq('user_id', user.id)

  return (
    <ChatView
      conv={convMeta}
      initialMessages={initialMessages}
      currentUserId={user.id}
    />
  )
}
