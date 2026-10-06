// Submit offline-aware: com rede cria de verdade (servidor); sem rede enfileira e
// retorna um id temporário (a entidade aparece como "pendente" até sincronizar).
//
// "Sem rede" não é só `navigator.onLine === false`: com Wi‑Fi sem internet ou
// sinal fraco o navegador diz que está online e a chamada falha. Nesse caso a
// criação também vai para a fila, em vez de virar erro e perder o wizard.

import { runCreation } from '@/app/(app)/offline/run-creation'
import { isNetworkError } from '@/lib/score-engine/SyncEngine'
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
  const online = typeof navigator === 'undefined' || navigator.onLine !== false

  if (online) {
    try {
      const r = await runCreation(args.op)
      if (!('error' in r)) return { id: r.id, queued: false }
      if (!isNetworkError(r.error)) return r
      // falha de rede devolvida como erro → cai na fila abaixo
    } catch (err) {
      if (!isNetworkError(err)) {
        return { error: err instanceof Error ? err.message : 'Não foi possível criar.' }
      }
      // A requisição não chegou ao servidor → fila
    }
  }

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
