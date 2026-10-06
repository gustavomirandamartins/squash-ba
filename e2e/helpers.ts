import { expect, type BrowserContext, type Page } from '@playwright/test'

// ── Dados de teste ───────────────────────────────────────────────────────────
// Só existem no navegador do teste: nada vai para o Supabase.

export const CHAMP_ID = '0e2e0000-0000-4000-8000-000000000001'
export const SEMI_1 = '0e2e0000-0000-4000-8000-0000000000a1'
export const SEMI_2 = '0e2e0000-0000-4000-8000-0000000000a2'
export const FINAL = '0e2e0000-0000-4000-8000-0000000000f1'
export const TEMP_ID = 'local-0e2e0000-0000-4000-8000-0000000000c1'

export const PROFILE = {
  userId: '0e2e0000-0000-4000-8000-0000000000u1',
  name: 'Organizador Teste',
  avatarUrl: null,
  isAdmin: false,
  canManage: true,
}

const stage = { counting: 'set', setsToPlay: 1, pointsPerSet: 11, winByTwo: true, setDrawEnabled: false, timeMinutes: null }
const side = (name: string | null) => ({ name, avatarUrl: null })
const NAMES: Record<string, string> = { p1: 'Ana', p2: 'Bia', p3: 'Caio', p4: 'Duda' }

/** Eliminatória real (criada online) de 4 jogadores, como o cache a guarda. */
export function cachedElim() {
  const m = (id: string, round: number, slot: number, a: string | null, b: string | null, next: string | null) => ({
    id, round, bracketSlot: slot, groupId: null, status: 'agendado', result: null, isWo: false, isDoubleWo: false,
    sideAId: a, sideBId: b, sideA: side(a ? NAMES[a] : null), sideB: side(b ? NAMES[b] : null),
    winnerAdvancesTo: next, scheduledAt: null, games: [], ...stage,
  })
  return {
    id: CHAMP_ID,
    name: 'Copa Offline',
    format: 'eliminatoria',
    unit: 'player',
    canManage: true,
    myParticipantIds: [],
    groups: [],
    sides: Object.fromEntries(Object.entries(NAMES).map(([id, n]) => [id, side(n)])),
    cfg: { pointsWin: 3, pointsDraw: 0, pointsLoss: 0, tiebreakers: ['sets_ganhos'] },
    teams: [],
    teamOf: {},
    matches: [
      m(SEMI_1, 1, 1, 'p1', 'p2', FINAL),
      m(SEMI_2, 1, 2, 'p3', 'p4', FINAL),
      m(FINAL, 2, 1, null, null, null),
    ],
    savedAt: Date.now(),
  }
}

/** Liga provisória (criada offline) de 3 jogadores, ainda na fila de criação. */
export function provisionalLiga() {
  const lp = (n: number) => `lp-0e2e0000-0000-4000-8000-00000000010${n}`
  const lm = (n: number) => `lm-0e2e0000-0000-4000-8000-00000000020${n}`
  const participants = ['Ana', 'Bia', 'Caio'].map((name, i) => ({
    id: lp(i + 1), userIds: [`0e2e0000-0000-4000-8000-00000000030${i + 1}`], name, avatarUrl: null, seed: null, groupId: null,
  }))
  const pairs: [number, number][] = [[1, 2], [1, 3], [2, 3]]
  const champ = {
    tempId: TEMP_ID,
    format: 'liga',
    unit: 'player',
    name: 'Liga de Quadra',
    startDate: null,
    stage: { counting: 'set', points_per_set: 11, win_by_two: true, set_draw_enabled: false, sets_to_play: 1 },
    rounds: 1,
    champ: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, tiebreakers: ['sets_ganhos'] },
    participants,
    matches: pairs.map(([a, b], i) => ({
      id: lm(i + 1), round: 1, sideA: lp(a), sideB: lp(b), status: 'agendado', result: null, games: [],
    })),
    createdAt: Date.now(),
  }
  const outbox = [{
    tempId: TEMP_ID,
    kind: 'campeonato',
    op: { type: 'champ_liga', cfg: { name: 'Liga de Quadra' } },
    snapshot: { name: 'Liga de Quadra', subtitle: 'Liga · 3 jogadores' },
    status: 'pending',
    createdAt: Date.now(),
  }]
  return { champ, outbox }
}

// ── Navegador ────────────────────────────────────────────────────────────────

/** Bloqueia o Supabase (inclusive o que o service worker buscaria). */
export async function blockSupabase(context: BrowserContext) {
  await context.route(/supabase\.co/, (route) => route.abort('internetdisconnected'))
}

/** Abre o app uma vez com rede e espera o service worker assumir a página. */
export async function installServiceWorker(page: Page) {
  await page.goto('/login')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload()
  }
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}

/** Grava no IndexedDB do idb-keyval (o que o app usa) e no localStorage. */
export async function seed(
  page: Page,
  data: { idb?: Record<string, unknown>; profile?: typeof PROFILE | null },
) {
  await page.evaluate(async ({ idb, profile }) => {
    if (profile) localStorage.setItem('sb-shell-profile', JSON.stringify({ ...profile, savedAt: Date.now() }))
    else localStorage.removeItem('sb-shell-profile')
    if (!idb) return
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('keyval-store')
      req.onupgradeneeded = () => req.result.createObjectStore('keyval')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('keyval', 'readwrite')
      for (const [k, v] of Object.entries(idb)) tx.objectStore('keyval').put(v, k)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, { idb: data.idb ?? null, profile: data.profile === undefined ? null : data.profile })
}

/** Lê uma chave do idb-keyval. */
export async function readIdb<T = unknown>(page: Page, key: string): Promise<T | undefined> {
  return page.evaluate(async (k) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('keyval-store')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const v = await new Promise<unknown>((resolve, reject) => {
      const r = db.transaction('keyval').objectStore('keyval').get(k)
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    db.close()
    return v
  }, key) as Promise<T | undefined>
}

/** Marca a página: some se ela recarregar (prova de navegação sem recarga). */
export async function markPage(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as { __e2eMark: number }).__e2eMark = 1
  })
}

export async function pageWasNotReloaded(page: Page) {
  return page.evaluate(() => (window as unknown as { __e2eMark?: number }).__e2eMark === 1)
}

/** Toca N vezes no placar de um jogador (botão grande "Ponto para …"). */
export async function score(page: Page, player: string, points: number) {
  const btn = page.getByRole('button', { name: `Ponto para ${player}`, exact: true })
  for (let i = 0; i < points; i++) await btn.click()
}
