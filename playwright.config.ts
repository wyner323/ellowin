import { defineConfig, devices } from "@playwright/test"
import { BASE_URL } from "./e2e/env.mjs"

/**
 * Testes de ponta a ponta: um navegador de verdade usando o app de verdade (`next start`) sobre um Postgres descartável.
 * `e2e/server.mjs` cria o banco `ellowin_e2e`, aplica as migrações, grava a semente e sobe o app; exige PG_TEST_URL
 * (nunca o banco de produção). Rodar: `pnpm test:e2e` (após `pnpm build`). Localmente E2E_DEV=1 usa `next dev` (sem build)
 * e E2E_CHANNEL=chrome usa o Chrome instalado em vez do Chromium do Playwright.
 *
 * Os testes de cada arquivo dependem do estado do banco deixado pelo anterior (a compra, depois a entrega, depois a
 * confirmação), então rodam em sequência, com um único trabalhador.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}) }, dependencies: ["setup"], testIgnore: /auth\.setup\.ts$/ },
  ],
  webServer: {
    command: "node e2e/server.mjs",
    url: `${BASE_URL}/robots.txt`,
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
})
