import { expect, test } from '@playwright/test'
import {
  CHAMP_ID, FINAL, PROFILE, SEMI_1, TEMP_ID,
  blockSupabase, cachedElim, installServiceWorker, markPage, pageWasNotReloaded,
  provisionalLiga, readIdb, score, seed,
} from './helpers'

// Modo offline de ponta a ponta: rede desligada, service worker real, dados
// no aparelho. Cobre o shell (mesma moldura do app), a chave avançando sem
// internet, o campeonato provisório e a persistência da fila.

test.beforeEach(async ({ context, page }) => {
  await blockSupabase(context)
  await installServiceWorker(page)
})

test('sem rede, o campeonato abre dentro do app com a navegação', async ({ context, page }) => {
  await seed(page, { profile: PROFILE, idb: { [`champ-cache:${CHAMP_ID}`]: cachedElim() } })
  await context.setOffline(true)

  await page.goto(`/campeonatos/${CHAMP_ID}`)

  await expect(page.getByRole('heading', { name: 'Copa Offline' })).toBeVisible()
  // Mesma moldura do app: navegação inferior com o Início.
  await expect(page.locator('nav').getByRole('link').first()).toBeVisible()
  await expect(page.getByText('Semifinal')).toBeVisible()
  await expect(page.getByText('Final', { exact: true })).toBeVisible()
  await expect(page.getByText('A definir')).toHaveCount(2)
})

test('vencedores avançam na chave offline, sem recarregar a página', async ({ context, page }) => {
  await seed(page, { profile: PROFILE, idb: { [`champ-cache:${CHAMP_ID}`]: cachedElim() } })
  await context.setOffline(true)
  await page.goto(`/campeonatos/${CHAMP_ID}`)
  await expect(page.getByRole('heading', { name: 'Copa Offline' })).toBeVisible()
  await markPage(page)

  // Semifinal 1: Ana 11 × 0 Bia
  await page.getByRole('link', { name: /Ana.*Bia/ }).click()
  await expect(page).toHaveURL(new RegExp(`/jogos/${SEMI_1}$`))
  await score(page, 'Ana', 11)
  await expect(page.getByText('Encerrado')).toBeVisible()
  // volta sozinho para a lista
  await expect(page).toHaveURL(new RegExp(`/campeonatos/${CHAMP_ID}$`), { timeout: 8_000 })

  // Semifinal 2: Caio 0 × 11 Duda
  await page.getByRole('link', { name: /Caio.*Duda/ }).click()
  await score(page, 'Duda', 11)
  await expect(page.getByText('Encerrado')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/campeonatos/${CHAMP_ID}$`), { timeout: 8_000 })

  // A final abre com os dois vencedores
  const final = page.getByRole('link', { name: /Ana.*Duda/ })
  await expect(final).toBeVisible()
  await final.click()
  await expect(page).toHaveURL(new RegExp(`/jogos/${FINAL}$`))
  await expect(page.getByRole('button', { name: 'Ponto para Ana', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Ponto para Duda', exact: true })).toBeEnabled()

  // Tudo isso trocando só a URL: a página nunca recarregou.
  expect(await pageWasNotReloaded(page)).toBe(true)

  // Os placares estão na fila, esperando a rede.
  const queue = await readIdb<unknown[]>(page, `queue:${SEMI_1}`)
  expect(queue?.length).toBeGreaterThan(0)
})

test('a fila e a chave sobrevivem a fechar e reabrir o app offline', async ({ context, page }) => {
  await seed(page, { profile: PROFILE, idb: { [`champ-cache:${CHAMP_ID}`]: cachedElim() } })
  await context.setOffline(true)
  await page.goto(`/campeonatos/${CHAMP_ID}/jogos/${SEMI_1}`)
  await score(page, 'Bia', 11)
  await expect(page.getByText('Encerrado')).toBeVisible()

  await page.goto(`/campeonatos/${CHAMP_ID}`)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Copa Offline' })).toBeVisible()
  // Bia segue na final depois de recarregar
  await expect(page.getByRole('link', { name: /Bia/ }).or(page.getByText('Bia')).last()).toBeVisible()
  await expect(page.getByText('A definir')).toHaveCount(1)
})

test('campeonato provisório: joga e classifica sem rede', async ({ context, page }) => {
  const { champ, outbox } = provisionalLiga()
  await seed(page, { profile: PROFILE, idb: { [`local-champ:${TEMP_ID}`]: champ, 'creation-outbox': outbox } })
  await context.setOffline(true)

  await page.goto(`/pendentes/${TEMP_ID}`)
  await expect(page.getByRole('heading', { name: 'Liga de Quadra' })).toBeVisible()
  await expect(page.locator('nav').getByRole('link').first()).toBeVisible()

  await page.getByRole('button', { name: /Ana.*Bia/ }).click()
  await score(page, 'Ana', 11)
  await expect(page.getByText('Encerrado')).toBeVisible()
  await page.getByRole('button', { name: 'Jogos' }).click()

  await page.getByRole('button', { name: 'Classificação' }).click()
  // Ana lidera com 3 pontos
  const firstRow = page.getByText('Ana').first()
  await expect(firstRow).toBeVisible()
  const saved = await readIdb<{ matches: { status: string }[] }>(page, `local-champ:${TEMP_ID}`)
  expect(saved?.matches.filter((m) => m.status === 'finalizado')).toHaveLength(1)
})

test('início offline: mesma tela do online, com o que está no aparelho', async ({ context, page }) => {
  await seed(page, { profile: PROFILE, idb: { [`champ-cache:${CHAMP_ID}`]: cachedElim() } })
  await context.setOffline(true)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Bem-vindo, Organizador!/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Acontecendo agora' })).toBeVisible()
  await markPage(page)
  await page.getByRole('link', { name: /Copa Offline/ }).click()
  await expect(page).toHaveURL(new RegExp(`/campeonatos/${CHAMP_ID}$`))
  await expect(page.getByRole('heading', { name: 'Copa Offline' })).toBeVisible()
  expect(await pageWasNotReloaded(page)).toBe(true)
})

test('campeonatos offline: mesma lista do online (filtros e status)', async ({ context, page }) => {
  await seed(page, {
    profile: PROFILE,
    idb: { [`champ-cache:${CHAMP_ID}`]: { ...cachedElim(), status: 'encerrado' } },
  })
  await context.setOffline(true)

  await page.goto('/campeonatos')
  await expect(page.getByRole('heading', { name: 'Campeonatos' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Criar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Todos' })).toBeVisible()
  const card = page.getByRole('link', { name: /Copa Offline/ })
  await expect(card).toContainText('Eliminatórias')
  await expect(card).toContainText('Encerrado')
  await page.getByRole('button', { name: 'Liga' }).click()
  await expect(page.getByText('Nenhum campeonato neste formato.')).toBeVisible()
})

test('campeonato ainda não guardado: aviso dentro do app', async ({ context, page }) => {
  await seed(page, { profile: PROFILE })
  await context.setOffline(true)
  await page.goto('/campeonatos/0e2e0000-0000-4000-8000-00000000ffff')
  await expect(page.getByText('Ainda não está no aparelho')).toBeVisible()
  await expect(page.locator('nav').getByRole('link').first()).toBeVisible()
})

test('sem perfil guardado: aviso para entrar com internet', async ({ context, page }) => {
  await seed(page, { profile: null })
  await context.setOffline(true)
  await page.goto(`/campeonatos/${CHAMP_ID}`)
  await expect(page.getByText('Entre na sua conta com internet')).toBeVisible()
})

test('a rede volta: oferece atualizar', async ({ context, page }) => {
  await seed(page, { profile: PROFILE, idb: { [`champ-cache:${CHAMP_ID}`]: cachedElim() } })
  await context.setOffline(true)
  await page.goto(`/campeonatos/${CHAMP_ID}`)
  await expect(page.getByRole('heading', { name: 'Copa Offline' })).toBeVisible()
  await expect(page.getByText('Conexão de volta')).toHaveCount(0)
  await context.setOffline(false)
  await expect(page.getByText('Conexão de volta')).toBeVisible()
})

test('versão nova descarta as páginas guardadas pela anterior', async ({ page }) => {
  // Cópia de página "da versão anterior" no cache do service worker.
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
    await (await caches.open('pages')).put('/versao-antiga', new Response('<p>antiga</p>'))
    await (await caches.open('pages-rsc')).put('/versao-antiga', new Response('antiga'))
  })

  // Novo service worker instala e assume (como depois de um deploy).
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const hits = await Promise.all(['pages', 'pages-rsc'].map(async (n) => (await caches.open(n)).match('/versao-antiga')))
        return hits.filter(Boolean).length
      }),
    )
    .toBe(0)
})

test('redirecionamento não é guardado como página: sem rede, cai no shell', async ({ context, page }) => {
  // Sem sessão, o servidor redireciona as telas do app para /login — o mesmo
  // mecanismo do aceite dos termos (/termos/aceitar). Com rede: navegação e
  // payload RSC de /campeonatos voltam redirecionados.
  await page.goto('/campeonatos')
  await expect(page).toHaveURL(/\/login/)
  await page.evaluate(async () => {
    await fetch('/campeonatos', { headers: { RSC: '1' } })
  })

  const guardadas = await page.evaluate(async () => {
    const out: string[] = []
    for (const name of ['pages', 'pages-rsc', 'pages-rsc-prefetch']) {
      if (!(await caches.has(name))) continue
      for (const req of await (await caches.open(name)).keys()) {
        if (new URL(req.url).pathname === '/campeonatos') out.push(name)
      }
    }
    return out
  })
  expect(guardadas).toEqual([])

  // Sem rede (e com o perfil guardado), /campeonatos abre no shell — não a
  // tela para onde o servidor redirecionou.
  await seed(page, { profile: PROFILE })
  await context.setOffline(true)
  await page.goto('/campeonatos')
  await expect(page.getByRole('heading', { name: 'Campeonatos' })).toBeVisible()
  await expect(page).toHaveURL(/\/campeonatos$/)
})

test('imagens do shell e da moldura carregam sem rede (logo incluído)', async ({ context, page }) => {
  await seed(page, { profile: PROFILE })
  const falhas: string[] = []
  page.on('requestfailed', (r) => {
    if (r.resourceType() === 'image') falhas.push(`falhou ${r.url()}`)
  })
  page.on('response', (r) => {
    if (r.request().resourceType() === 'image' && r.status() >= 400) falhas.push(`${r.status()} ${r.url()}`)
  })
  await context.setOffline(true)

  // Celular (TopBar) e computador (barra lateral): cada moldura tem seu logo.
  for (const tela of [{ width: 412, height: 915 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(tela)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Bem-vindo/ })).toBeVisible()
    await page.waitForFunction(() => [...document.images].every((i) => i.complete))
    const quebradas = await page.evaluate(() =>
      [...document.images].filter((i) => i.naturalWidth === 0).map((i) => i.currentSrc || i.src),
    )
    expect(quebradas, `tela ${tela.width}px`).toEqual([])
    expect(await page.locator('img[alt="SquashBa"]').count(), `logo na tela ${tela.width}px`).toBeGreaterThan(0)
  }
  expect(falhas).toEqual([])
})
