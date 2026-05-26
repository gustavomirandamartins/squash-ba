import { createClient } from '@/utils/supabase/server'

export interface UserRoles {
  isPlayer: boolean
  isOrganizer: boolean
  isAdmin: boolean
  /** true se organizer OU admin — usado para gating da área /gestao */
  canManage: boolean
}

/**
 * Lê todos os papéis do usuário em uma única query.
 * Recebe userId para evitar chamar getUser() novamente quando o caller já o fez.
 */
export async function getUserRoles(userId: string): Promise<UserRoles> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)

  const set = new Set((data ?? []).map((r) => r.role as string))

  const isPlayer = set.has('player')
  const isOrganizer = set.has('organizer')
  const isAdmin = set.has('admin')

  return {
    isPlayer,
    isOrganizer,
    isAdmin,
    canManage: isOrganizer || isAdmin,
  }
}
