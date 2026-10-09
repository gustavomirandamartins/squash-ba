// Linha da RPC get_my_conversations → item da lista de conversas.
// Fora do componente (que é client) para o servidor também poder usar.

import type { ConvItem } from '@/components/mensagens/ConversationList'

export type ConvRow = {
  conversation_id: string
  kind: 'direct' | 'group'
  title: string | null
  championship_id: string | null
  last_body: string | null
  last_at: string | null
  unread_count: number | null
  other_user_id: string | null
  other_name: string | null
  other_avatar: string | null
}

/** A RPC já devolve ordenado pela mensagem mais recente. */
export function toConvItems(rows: ConvRow[] | null | undefined): ConvItem[] {
  return (rows ?? []).map((c) => ({
    id: c.conversation_id,
    kind: c.kind,
    title: c.title,
    championshipId: c.championship_id,
    lastMessageBody: c.last_body,
    lastMessageAt: c.last_at,
    unreadCount: c.unread_count ?? 0,
    otherUserId: c.other_user_id,
    otherUserName: c.other_name,
    otherUserAvatar: c.other_avatar,
  }))
}
