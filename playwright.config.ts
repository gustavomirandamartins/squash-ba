import { readFileSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// Testes ponta a ponta do modo offline (e2e/). Rodam contra o build de
// produção — o service worker só existe nele — numa porta própria.
//
//   npm run test:e2e
//
// Nenhum teste fala com o Supabase de produção:
//   • o servidor de teste (build + next start) recebe o Supabase FICTÍCIO do
//     CI, sempre — variáveis já definidas no ambiente não são sobrescritas pelo
//     .env.local. Inclui as chaves só do servidor (secreta, cron, VAPID), para
//     as de verdade nunca saírem da máquina;
//   • no navegador, as requisições para *.supabase.co são bloqueadas e os dados
//     entram direto no armazenamento do aparelho.
const PORT = Number(process.env.E2E_PORT ?? 3100)

// Os mesmos valores do CI (.github/workflows/ci.yml).
const E2E_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://ci-placeholder.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ci_placeholder',
  SUPABASE_SECRET_KEY: 'sb_secret_ci_placeholder',
  CRON_SECRET: 'e2e-placeholder',
  VAPID_PRIVATE_KEY: 'e2e-placeholder',
  NEXT_TELEMETRY_DISABLED: '1',
}

// As variáveis NEXT_PUBLIC_* entram no build. O build de teste grava este
// marcador; E2E_SKIP_BUILD=1 só reaproveita um build feito assim — um `npm run
// build` comum (com o .env.local) apontaria o servidor de teste para produção.
const MARKER = '.next/E2E_SUPABASE_URL'
if (process.env.E2E_SKIP_BUILD) {
  let built = ''
  try {
    built = readFileSync(MARKER, 'utf8').trim()
  } catch {
    /* sem marcador */
  }
  if (built !== E2E_ENV.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error(
      'E2E_SKIP_BUILD: o build em .next não foi feito com o Supabase fictício dos testes. Rode sem E2E_SKIP_BUILD.',
    )
  }
}
const BUILD = `npm run build && node -e "require('fs').writeFileSync('${MARKER}', process.env.NEXT_PUBLIC_SUPABASE_URL)"`

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  webServer: {
    // E2E_SKIP_BUILD=1 reaproveita o build de teste (.next com o marcador).
    command: process.env.E2E_SKIP_BUILD
      ? `npx next start -p ${PORT}`
      : `${BUILD} && npx next start -p ${PORT}`,
    env: E2E_ENV,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
