import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { blockUser, reportContent, unblockUser } from './moderation'

// Cliente falso: registra a chamada e devolve o erro configurado.
function fake(error: { code?: string; message: string } | null) {
  const calls: { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[] = []
  const client = {
    from(table: string) {
      const call = { table, op: '', payload: undefined as unknown, filters: [] as [string, unknown][] }
      calls.push(call)
      const chain = {
        insert(p: unknown) { call.op = 'insert'; call.payload = p; return Promise.resolve({ error }) },
        delete() { call.op = 'delete'; return chain },
        eq(col: string, v: unknown) { call.filters.push([col, v]); return Object.assign(Promise.resolve({ error }), chain) },
      }
      return chain
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe('reportContent', () => {
  it('grava a denúncia com detalhes aparados (vazio vira null)', async () => {
    const { client, calls } = fake(null)
    const r = await reportContent(client, 'u1', 'post', 'p1', 'spam', '   ')
    expect(r.error).toBeNull()
    expect(calls[0]).toMatchObject({
      table: 'content_reports',
      op: 'insert',
      payload: { reporter_id: 'u1', target_type: 'post', target_id: 'p1', reason: 'spam', details: null },
    })
  })

  it('denúncia repetida (já aberta) vira mensagem amigável', async () => {
    const { client } = fake({ code: '23505', message: 'duplicate key' })
    const r = await reportContent(client, 'u1', 'post', 'p1', 'spam', '')
    expect(r.error).toMatch(/já denunciou/)
  })
})

describe('bloqueio', () => {
  it('bloquear quem já está bloqueado não é erro', async () => {
    const { client } = fake({ code: '23505', message: 'duplicate key' })
    expect((await blockUser(client, 'u1', 'u2')).error).toBeNull()
  })

  it('desbloquear apaga só a minha linha com aquela pessoa', async () => {
    const { client, calls } = fake(null)
    await unblockUser(client, 'u1', 'u2')
    expect(calls[0]).toMatchObject({ table: 'user_blocks', op: 'delete' })
    expect(calls[0].filters).toEqual([['blocker_id', 'u1'], ['blocked_id', 'u2']])
  })
})
