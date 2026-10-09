import { redirect } from 'next/navigation'
import { createClient, getAuthUser } from '@/utils/supabase/server'
import { ConversationList } from '@/components/mensagens/ConversationList'
import { toConvItems, type ConvRow } from '@/lib/conversations'

export const metadata = { title: 'Mensagens' }

export default async function MensagensPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  // Uma chamada: conversas + última mensagem + não lidas + o outro participante
  // (RPC get_my_conversations). Antes: 1 consulta por conversa, mais duas
  // rodadas para descobrir o outro membro e o perfil dele.
  const { data } = await supabase.rpc('get_my_conversations')

  return <ConversationList initialConversations={toConvItems(data as ConvRow[] | null)} currentUserId={user.id} />
}
