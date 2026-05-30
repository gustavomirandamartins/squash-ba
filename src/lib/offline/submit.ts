// Submit offline-aware: online cria de verdade (servidor); offline enfileira e
// retorna um id temporário (a entidade aparece como "pendente" até sincronizar).

import { runCreation } from '@/app/(app)/offline/run-creation'
import { addToOutbox } from './outbox'
import type { CreationOp, CreationKind, PendingSnapshot } from './types'

export type SubmitResult =
  | { id: string; queued: boolean }
  | { error: string }

export async function submitCreation(args: {
  kind: CreationKind
  op: CreationOp
  snapshot: PendingSnapshot
}): Promise<SubmitResult> {
  const online = typeof navigator === 'undefined' || navigator.onLine

  if (online) {
    const r = await runCreation(args.op)
    if ('error' in r) return r
    return { id: r.id, queued: false }
  }

  // Offline → enfileira
  const tempId =
    'local-' + (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random())
  await addToOutbox({
    tempId,
    kind: args.kind,
    op: args.op,
    snapshot: args.snapshot,
    status: 'pending',
    createdAt: Date.now(),
  })
  return { id: tempId, queued: true }
}
