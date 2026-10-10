import { expect, test } from '@playwright/test'

// Rotas sem sessão: o proxy manda as telas do app para /login (com ?next=)
// antes de qualquer renderização; as públicas abrem normalmente.

const APP_ROUTES = [
  '/',
  '/campeonatos',
  '/campeonatos/novo',
  '/campeonatos/0e2e0000-0000-4000-8000-000000000001',
  '/desafios/novo',
  '/mensagens',
  '/comunidade',
  '/jogador/0e2e0000-0000-4000-8000-000000000001',
  '/perfil',
  '/onboarding',
  '/termos/aceitar',
  '/admin/denuncias',
  '/campeonatos?formato=liga',
]

test('rota do app sem sessão vai para /login antes de renderizar', async ({ request }) => {
  for (const path of APP_ROUTES) {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.status(), path).toBe(307)
    const location = new URL(res.headers()['location'], 'http://localhost')
    expect(location.pathname, path).toBe('/login')
    // Volta para onde ia (o início dispensa o ?next=).
    expect(location.searchParams.get('next'), path).toBe(path === '/' ? null : path)
  }
})

test('no navegador: abre o login e guarda o destino', async ({ page }) => {
  await page.goto('/campeonatos/novo')
  await expect(page).toHaveURL(/\/login\?next=%2Fcampeonatos%2Fnovo$/)
  await expect(page.getByRole('button', { name: /Entrar/ }).first()).toBeVisible()
})

test('rotas públicas abrem sem sessão', async ({ request }) => {
  for (const path of ['/login', '/privacidade', '/termos', '/~offline']) {
    const res = await request.get(path, { maxRedirects: 0 })
    expect(res.status(), path).toBe(200)
  }

  // Service worker, manifest e ícone: fora do proxy.
  const sw = await request.get('/serwist/sw.js', { maxRedirects: 0 })
  expect(sw.status()).toBe(200)
  expect(sw.headers()['content-type']).toContain('javascript')
  expect((await request.get('/manifest.webmanifest', { maxRedirects: 0 })).status()).toBe(200)
  expect((await request.get('/icon.png', { maxRedirects: 0 })).status()).toBe(200)

  // /auth e /api respondem por conta própria (não são mandadas para o login
  // pelo proxy): callback sem código → /login?error=auth; cron sem segredo → 401.
  const cb = await request.get('/auth/callback', { maxRedirects: 0 })
  expect(cb.status()).toBe(307)
  expect(new URL(cb.headers()['location']).search).toBe('?error=auth')
  expect((await request.get('/api/keep-alive', { maxRedirects: 0 })).status()).toBe(401)
})

test('"Voltar" das páginas públicas: página anterior ou, sem histórico, o início', async ({ page }) => {
  // Com histórico: volta para onde estava.
  await page.goto('/privacidade')
  await page.goto('/termos')
  await page.getByRole('button', { name: 'Voltar' }).click()
  await expect(page).toHaveURL(/\/privacidade$/)

  // Sem histórico: aba nova, como o link dos termos no cadastro (target=_blank).
  // Vai para o início — sem sessão, o proxy leva ao login.
  const [aba] = await Promise.all([
    page.context().waitForEvent('page'),
    page.evaluate(() => window.open('/termos', '_blank', 'noopener')),
  ])
  await aba.waitForLoadState()
  expect(await aba.evaluate(() => window.history.length)).toBe(1)
  await aba.getByRole('button', { name: 'Voltar' }).click()
  await expect(aba).toHaveURL(/\/login$/)
})
