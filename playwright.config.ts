import { defineConfig, devices } from '@playwright/test'

// Testes ponta a ponta do modo offline (e2e/). Rodam contra o build de
// produção — o service worker só existe nele — numa porta própria.
//
//   npm run test:e2e
//
// Nenhum teste fala com o Supabase: as requisições para *.supabase.co são
// bloqueadas e os dados entram direto no armazenamento do aparelho (o que o
// app teria guardado ao abrir com internet).
const PORT = Number(process.env.E2E_PORT ?? 3100)

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
    // E2E_SKIP_BUILD=1 reaproveita o build atual (.next).
    command: process.env.E2E_SKIP_BUILD
      ? `npx next start -p ${PORT}`
      : `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
