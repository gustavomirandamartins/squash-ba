// Fila de criações pendentes (offline) em IndexedDB via idb-keyval.
// Notifica a UI via CustomEvent no window para as ilhas reagirem.

import { get, set } from 'idb-keyval'
import type { OutboxItem } from './types'

const KEY = 'creation-outbox'
export const OUTBOX_EVENT = 'sb-outbox-changed'

function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OUTBOX_EVENT))
}

export async function getOutbox(): Promise<OutboxItem[]> {
  return ((await get(KEY)) as OutboxItem[] | undefined) ?? []
}

async function save(items: OutboxItem[]): Promise<void> {
  await set(KEY, items)
  notify()
}

export async function addToOutbox(item: OutboxItem): Promise<void> {
  const items = await getOutbox()
  await save([...items, item])
}

export async function updateOutbox(tempId: string, patch: Partial<OutboxItem>): Promise<void> {
  const items = await getOutbox()
  await save(items.map((it) => (it.tempId === tempId ? { ...it, ...patch } : it)))
}

export async function removeFromOutbox(tempId: string): Promise<void> {
  const items = await getOutbox()
  await save(items.filter((it) => it.tempId !== tempId))
}
