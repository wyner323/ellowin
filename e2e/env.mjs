// Configuração compartilhada pelo servidor de teste (e2e/server.mjs), pelo Playwright e pelos testes.
// Os testes de ponta a ponta NUNCA tocam o banco de produção: exigem um Postgres descartável em PG_TEST_URL
// (o mesmo dos testes de concorrência) e criam nele um banco próprio, `ellowin_e2e`.

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100)
export const WS_PROXY_PORT = Number(process.env.E2E_WS_PROXY_PORT ?? 5444)
export const E2E_DB = "ellowin_e2e"
export const BASE_URL = `http://localhost:${E2E_PORT}`

export function adminUrl() {
  const url = process.env.PG_TEST_URL?.trim()
  if (!url) {
    throw new Error(
      "PG_TEST_URL não definida. Os testes de ponta a ponta precisam de um Postgres descartável (ex.: postgresql://postgres:postgres@localhost:5432/postgres), nunca o banco de produção.",
    )
  }
  return url
}

export function e2eDatabaseUrl() {
  const url = new URL(adminUrl())
  url.pathname = `/${E2E_DB}`
  return url.toString()
}

/** Contas criadas pela semente; a senha é a mesma para todas. */
export const PASSWORD = "Senha1234"
export const SELLER = { id: "e2e-vendedor", email: "vendedor@e2e.test", displayName: "LojaE2E", storeSlug: "loja-e2e" }
export const BUYER = { id: "e2e-comprador", email: "comprador@e2e.test", displayName: "CompradorE2E" }
export const LISTING = { slug: "conta-valorant-e2e", title: "Conta Valorant E2E", priceCents: 5000, buyerFundsCents: 50_000 }
