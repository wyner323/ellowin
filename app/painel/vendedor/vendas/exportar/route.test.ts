import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/** Exportação de vendas em CSV: só o que é do vendedor, sem dado pessoal do comprador, e à prova de fórmula de planilha. */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
}))

vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db
  },
  pool: {
    query: (text: string, params?: unknown[]) => holder.pool.query(text, params),
    connect: () => holder.pool.connect(),
  },
}))
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => (holder.userId ? { user: { id: holder.userId } } : null) } },
}))
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }) }))
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server")
  return { ...actual, after: () => {} }
})

import { GET } from "@/app/painel/vendedor/vendas/exportar/route"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

const ago = (n: number) =>
  `((((now() AT TIME ZONE 'America/Sao_Paulo')::date - ${n}) + time '12:00') AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'`

let productId = 0
let otherProductId = 0

beforeEach(async () => {
  holder.userId = "ana"
  await t.query(`TRUNCATE "auth_attempt", "order", "product_variant", "product", "seller_application", "user" RESTART IDENTITY CASCADE`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('ana', 'Ana Maria da Silva', 'ana@t.dev', 'AnaGames'), ('outra', 'Outra Loja', 'o@t.dev', 'Outra')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('b1', 'Carlos Pereira Lima', 'carlos@secreto.dev', 'CarlosPlay'), ('b2', 'Beatriz Souza Reis', 'bia@secreto.dev', NULL)`)
  await t.query(`INSERT INTO "seller_application" ("userId", "status") VALUES ('ana', 'aprovado'), ('outra', 'aprovado')`)
  productId = (await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('ana', 'a', 'Conta A', 'contas') RETURNING "id"`)).rows[0].id as number
  otherProductId = (await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('outra', 'o', 'Conta Alheia', 'contas') RETURNING "id"`)).rows[0].id as number
  for (const p of [productId, otherProductId]) await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'v', 1000, 5)`, [p])
})

async function order(o: { title?: string; buyer?: string; seller?: string; product?: number; status?: string; created?: number; gross?: number } = {}) {
  const product = o.product ?? productId
  await t.query(
    `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents", "status", "createdAt")
     VALUES ($1, $2, $3, (SELECT "id" FROM "product_variant" WHERE "productId" = $3 LIMIT 1), $4, 'Imortal', $5, 80, $6, $7, ${ago(o.created ?? 0)})`,
    [o.buyer ?? "b1", o.seller ?? "ana", product, o.title ?? "Conta A", (o.gross ?? 1000), (o.gross ?? 1000) - 80, o.status ?? "concluido"],
  )
}

const get = (qs = "") => GET(new Request(`https://ellowin.com.br/painel/vendedor/vendas/exportar${qs}`))

describe("GET /painel/vendedor/vendas/exportar", () => {
  it("exige login e vendedor aprovado", async () => {
    holder.userId = null
    expect((await get()).status).toBe(401)
    holder.userId = "b1"
    expect((await get()).status).toBe(403)
  })

  it("devolve CSV de planilha: BOM, ; e cabeçalhos; só pedidos do vendedor; nome público e dinheiro com vírgula", async () => {
    await order({ buyer: "b1", gross: 12_345 })
    await order({ buyer: "b2", gross: 5_000, status: "cancelado" })
    await order({ seller: "outra", product: otherProductId, title: "Pedido de outra loja" })

    const res = await get("?periodo=30")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8")
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="vendas-ellowin-30d-\d{4}-\d{2}-\d{2}\.csv"$/)
    expect(res.headers.get("cache-control")).toBe("private, no-store")

    // o BOM (EF BB BF) fica nos bytes; `text()` o remove ao decodificar
    expect([...new Uint8Array(await res.clone().arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = await res.text()
    expect(text.startsWith("Pedido;Data da compra;Situação;Anúncio;Variação;Comprador;")).toBe(true)
    const lines = text.trim().split("\r\n")
    expect(lines).toHaveLength(3) // cabeçalho + 2 pedidos dela
    expect(text).not.toContain("Pedido de outra loja")
    // nome público: apelido ou "Usuário XXXX"; nunca o nome legal nem o e-mail
    expect(text).toContain("CarlosPlay")
    expect(text).toContain("Usuário B2")
    for (const secret of ["Carlos Pereira Lima", "Beatriz", "secreto.dev"]) expect(text).not.toContain(secret)
    // 12345 centavos pagos, 80 de taxa, 12265 líquido
    expect(text).toContain(";123,45;0,80;122,65;")
    expect(text).toContain(";Imortal;")
  })

  it("fórmula de planilha no título do anúncio é neutralizada", async () => {
    await order({ title: '=HYPERLINK("http://golpe.com";"clique")' })
    const text = await (await get()).text()
    expect(text).toContain("\"'=HYPERLINK(")
    expect(text.split("\r\n")[1]).not.toMatch(/;=HYPERLINK/)
  })

  it("filtra por período (dia de Brasília), por situação e exporta tudo com ?periodo=todos", async () => {
    await order({ created: 0 })
    await order({ created: 10 })
    await order({ created: 60, status: "cancelado" })
    const rows = async (qs: string) => (await (await get(qs)).text()).trim().split("\r\n").length - 1
    expect(await rows("?periodo=7")).toBe(1)
    expect(await rows("?periodo=30")).toBe(2)
    expect(await rows("?periodo=90")).toBe(3)
    expect(await rows("?periodo=todos")).toBe(3)
    expect(await rows("?periodo=todos&status=cancelado")).toBe(1)
    // valores estranhos nunca viram filtro nem consulta: cai no padrão (30 dias) e ignora status desconhecido
    expect(await rows("?periodo=abc&status=constructor")).toBe(2)
  })

  it("no máximo 10 exportações por hora", async () => {
    for (let i = 0; i < 10; i++) expect((await get()).status, `exportação ${i + 1}`).toBe(200)
    expect((await get()).status).toBe(429)
  })
})
