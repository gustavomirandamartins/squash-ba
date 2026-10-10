import { expect, test, type Page } from '@playwright/test'
import { PROFILE, blockSupabase, installServiceWorker, seed } from './helpers'

// Navegação principal com 5 abas e Ajuda no menu do avatar. As telas do app
// exigem login; o shell offline monta a MESMA moldura (AppFrame: BottomNav,
// DesktopSidebar, TopBar e menu do avatar) com o perfil guardado — é por ele
// que a navegação é testada aqui.

const ABAS = ['Início', 'Campeonatos', 'Marketplace', 'Comunidade', 'Mensagens']

// Prints opcionais (relatório): E2E_SHOTS=<pasta>.
const SHOTS = process.env.E2E_SHOTS

async function abrirShell(page: Page) {
  await seed(page, { profile: PROFILE })
  await page.context().setOffline(true)
  await page.goto('/campeonatos')
  await expect(page.getByRole('heading', { name: 'Campeonatos' })).toBeVisible()
}

test.beforeEach(async ({ context, page }) => {
  await blockSupabase(context)
  await installServiceWorker(page)
})

test('celular: 5 abas na barra inferior e Ajuda no menu do avatar', async ({ page }) => {
  await abrirShell(page)

  const nav = page.locator('nav').filter({ has: page.getByRole('link', { name: 'Início' }) }).first()
  await expect(nav.getByRole('link')).toHaveCount(5)
  for (const [i, aba] of ABAS.entries()) {
    await expect(nav.getByRole('link').nth(i)).toHaveAttribute('aria-label', aba)
  }
  await expect(page.getByRole('link', { name: 'Ajuda', exact: true })).toHaveCount(0)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/nav-celular.png` })

  await page.getByRole('button', { name: 'Menu do usuário' }).click()
  const ajuda = page.getByRole('link', { name: 'Ajuda e feedback' })
  await expect(ajuda).toBeVisible()
  // Logo acima de Sair.
  const itens = page.locator('a, button').filter({ hasText: /^(Editar perfil|Ajuda e feedback|Sair)$/ })
  await expect(itens).toHaveText(['Editar perfil', 'Ajuda e feedback', 'Sair'])
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/menu-avatar-celular.png` })

  // Offline, /ajuda segue a regra das telas que precisam de rede.
  await ajuda.click()
  await expect(page).toHaveURL(/\/ajuda$/)
  await expect(page.getByRole('heading', { name: 'Esta tela precisa de internet' })).toBeVisible()
})

test('computador: 5 abas na barra lateral e Ajuda no menu do avatar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await abrirShell(page)

  const lateral = page.locator('aside nav')
  await expect(lateral.getByRole('link')).toHaveCount(5)
  await expect(lateral.getByRole('link')).toHaveText(ABAS)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/nav-computador.png` })

  await page.locator('aside').getByRole('button', { name: 'Menu do usuário' }).click()
  await expect(page.getByRole('link', { name: 'Ajuda e feedback' })).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/menu-avatar-computador.png` })
  await page.getByRole('link', { name: 'Ajuda e feedback' }).click()
  await expect(page).toHaveURL(/\/ajuda$/)
  await expect(page.getByRole('heading', { name: 'Esta tela precisa de internet' })).toBeVisible()
})
