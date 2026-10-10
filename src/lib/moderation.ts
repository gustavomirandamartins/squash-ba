// Denúncia e bloqueio — escrita direta nas tabelas (o RLS e os gatilhos do
// banco aplicam as regras; o app iOS faz o mesmo).

import type { SupabaseClient } from '@supabase/supabase-js'

export type ReportTarget = 'post' | 'comment' | 'message' | 'profile'

export type ReportReason =
  | 'spam'
  | 'ofensa_ou_assedio'
  | 'conteudo_improprio'
  | 'perfil_falso'
  | 'outro'

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'ofensa_ou_assedio', label: 'Ofensa ou assédio' },
  { value: 'conteudo_improprio', label: 'Conteúdo impróprio' },
  { value: 'perfil_falso', label: 'Perfil falso' },
  { value: 'outro', label: 'Outro' },
]

export const REASON_LABEL: Record<ReportReason, string> = Object.fromEntries(
  REPORT_REASONS.map((r) => [r.value, r.label]),
) as Record<ReportReason, string>

export const TARGET_LABEL: Record<ReportTarget, string> = {
  post: 'Post',
  comment: 'Comentário',
  message: 'Mensagem',
  profile: 'Perfil',
}

export async function reportContent(
  supabase: SupabaseClient,
  reporterId: string,
  targetType: ReportTarget,
  targetId: string,
  reason: ReportReason,
  details: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('content_reports').insert({
    reporter_id: reporterId,
    target_type: targetType,
    target_id: targetId,
    reason,
    details: details.trim() || null,
  })
  if (!error) return { error: null }
  // Índice "uma denúncia aberta por usuário e alvo".
  if (error.code === '23505') return { error: 'Você já denunciou isto. A denúncia está em análise.' }
  return { error: error.message }
}

export async function blockUser(
  supabase: SupabaseClient,
  blockerId: string,
  blockedId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('user_blocks')
    .insert({ blocker_id: blockerId, blocked_id: blockedId })
  // Já bloqueado: o resultado é o mesmo.
  if (!error || error.code === '23505') return { error: null }
  return { error: error.message }
}

export async function unblockUser(
  supabase: SupabaseClient,
  blockerId: string,
  blockedId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
  return { error: error?.message ?? null }
}
