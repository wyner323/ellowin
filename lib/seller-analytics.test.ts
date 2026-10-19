import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Métricas do painel do vendedor contra um Postgres em memória com as migrações reais. Os instantes dos pedidos são
 * montados em SQL a partir do dia de Brasília ("N dias atrás, meio-dia"), para o teste não depender do horário em que roda.
 */

const holder = vi.hoisted(() => ({ pool: null as unknown as TestDb["pool"] }))
vi.mock("@/lib/db", () => ({ pool: { query: (text: string, params?: unknown[]) => holder.pool.query(text, params) } }))

import { getRecentViews, getSellerAnalytics } from "@/lib/seller-analytics"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

/** Instante UTC de "meio-dia de Brasília, N dias atrás". */
const ago = (n: number) =>
  `((((now() AT TIME ZONE 'America/Sao_Paulo')::date - ${n}) + time '12:00') AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'`

let p1 = 0
let p2 = 0
let p3 = 0

beforeEach(async () => {
  await t.query(`TRUNCATE "dispute", "order", "product_view_daily", "product_variant", "product", "user" RESTART IDENTITY CASCADE`)
  for (const id of ["s", "outro", "b1", "b2", "b3"]) await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $1 || '@t.dev')`, [id])
  const add = async (seller: string, slug: string, game: string | null, category: string, status = "ativo") =>
    (await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game", "status") VALUES ($1, $2, $3, $4, $5, $6) RETURNING "id"`, [seller, slug, `Anúncio ${slug}`, category, game, status])).rows[0].id as number
  p1 = await add("s", "val", "Valorant", "contas")
  p2 = await add("s", "rbx", "Roblox", "moedas")
  p3 = await add("outro", "alheio", "Valorant", "contas")
  for (const p of [p1, p2, p3]) await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'v', 1000, 5)`, [p])
})

type Opts = { buyer?: string; status?: string; net?: number; created?: number; completed?: number | null; delivered?: number | null; due?: number | null; release?: number | null; product?: number; seller?: string }
async function order(o: Opts = {}) {
  const product = o.product ?? p1
  const net = o.net ?? 920
  const created = o.created ?? 0
  const sql = (n: number | null | undefined) => (n === null || n === undefined ? "NULL" : ago(n))
  const { rows } = await t.query(
    `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents", "status", "createdAt", "completedAt", "deliveredAt", "deliveryDueAt", "autoReleaseAt")
     VALUES ($1, $2, $3, (SELECT "id" FROM "product_variant" WHERE "productId" = $3 LIMIT 1), 't', 'v', $4, $5, $6, $7, ${sql(created)}, ${sql(o.completed === undefined && (o.status ?? "concluido") === "concluido" ? created : o.completed)}, ${sql(o.delivered)}, ${sql(o.due)}, ${sql(o.release)})
     RETURNING "id"`,
    [o.buyer ?? "b1", o.seller ?? "s", product, net + 80, 80, net, o.status ?? "concluido"],
  )
  return rows[0].id as number
}

describe("getSellerAnalytics", () => {
  it("séries diárias contínuas: janela atual e anterior com `days` pontos cada, do mais antigo ao mais novo", async () => {
    const a = await getSellerAnalytics("s", 30)
    expect(a.series).toHaveLength(30)
    expect(a.previousSeries).toHaveLength(30)
    const days = [...a.previousSeries, ...a.series].map((p) => p.day)
    expect([...days].sort()).toEqual(days)
    expect(new Set(days).size).toBe(60)
    const { rows } = await t.query(`SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS d`)
    expect(a.to).toBe(rows[0].d)
    expect(a.current).toMatchObject({ revenueCents: 0, concluded: 0, orders: 0, avgTicketCents: null })
  })

  it("soma receita líquida por dia de conclusão e compara com o período anterior", async () => {
    await order({ net: 1000, created: 0 }) // hoje
    await order({ net: 500, created: 3 }) // 3 dias atrás
    await order({ net: 800, created: 40 }) // janela anterior (31–60 dias)
    await order({ net: 9999, created: 70 }) // fora das duas janelas
    await order({ net: 7777, seller: "outro", product: p3 }) // de outro vendedor: nunca entra

    const a = await getSellerAnalytics("s", 30)
    expect(a.current.revenueCents).toBe(1500)
    expect(a.current.concluded).toBe(2)
    expect(a.current.avgTicketCents).toBe(750)
    expect(a.previous.revenueCents).toBe(800)
    expect(a.deltas.revenue).toMatchObject({ diff: 700, direction: "up" })
    expect(a.deltas.revenue.pct).toBeCloseTo(87.5, 5)
    expect(a.series.at(-1)).toMatchObject({ revenueCents: 1000, concluded: 1, orders: 1 })
    expect(a.series.at(-4)).toMatchObject({ revenueCents: 500 })
    // taxa e bruto: gross = net + 80 por pedido
    expect(a.current.feeCents).toBe(160)
    expect(a.current.grossCents).toBe(1500 + 160)
  })

  it("pedido criado conta no dia da compra; venda conta no dia da conclusão (podem ser dias diferentes)", async () => {
    await order({ created: 5, completed: 2, net: 600 })
    const a = await getSellerAnalytics("s", 7)
    expect(a.series.at(-6)).toMatchObject({ orders: 1, concluded: 0, revenueCents: 0 })
    expect(a.series.at(-3)).toMatchObject({ orders: 0, concluded: 1, revenueCents: 600 })
  })

  it("quebra por jogo e por categoria, com 'Outros' na cauda e só do vendedor", async () => {
    await order({ product: p1, net: 1000 })
    await order({ product: p1, net: 500, created: 2 })
    await order({ product: p2, net: 300 })
    const a = await getSellerAnalytics("s", 30)
    expect(a.byGame).toEqual([
      { label: "Valorant", value: 1500, count: 2 },
      { label: "Roblox", value: 300, count: 1 },
    ])
    expect(a.byCategory.map((r) => [r.label, r.value])).toEqual([["contas", 1500], ["moedas", 300]])
  })

  it("borda da janela de 30 dias: o 30º dia (há 29 dias) entra, o 31º (há 30) já é do período anterior — em todas as quebras", async () => {
    const dentro = await order({ created: 29, net: 100, buyer: "b1", product: p1 })
    const fora = await order({ created: 30, net: 900, buyer: "b2", product: p2, status: "cancelado", completed: null })
    expect(dentro).toBeGreaterThan(0)
    expect(fora).toBeGreaterThan(0)
    await order({ created: 30, net: 700, buyer: "b2", product: p2 }) // concluída há 30 dias: fora da janela atual

    const a = await getSellerAnalytics("s", 30)
    // série: o primeiro ponto da janela atual é há 29 dias
    expect(a.series[0]).toMatchObject({ revenueCents: 100, orders: 1 })
    expect(a.previousSeries.at(-1)).toMatchObject({ revenueCents: 700, orders: 2 })
    // quebras por jogo/categoria e compradores só olham a janela atual
    expect(a.byGame).toEqual([{ label: "Valorant", value: 100, count: 1 }])
    expect(a.byCategory.map((r) => r.label)).toEqual(["contas"])
    expect(a.buyers).toMatchObject({ total: 1, revenueCents: 100 })
    // desfecho: o pedido cancelado de há 30 dias é do período anterior
    expect(a.operations).toMatchObject({ orders: 1, cancelled: 0 })
    expect(a.previousOperations).toMatchObject({ orders: 2, cancelled: 1 })
    // anúncios: só o de dentro da janela tem receita
    expect(a.products.find((p) => p.id === p1)).toMatchObject({ revenueCents: 100, orders: 1 })
    expect(a.products.find((p) => p.id === p2)).toMatchObject({ revenueCents: 0, orders: 0 })
  })

  it("desfecho dos pedidos criados: cancelamento, reembolso e disputa viram taxas", async () => {
    await order({ status: "concluido" })
    await order({ status: "concluido" })
    await order({ status: "cancelado", completed: null })
    const refunded = await order({ status: "reembolsado", completed: null })
    await t.query(`INSERT INTO "dispute" ("orderId", "openedBy", "reason", "firstContactDueAt", "sellerResponseDueAt", "resolutionDueAt") VALUES ($1, 'b1', 'x', now(), now(), now())`, [refunded])
    const a = await getSellerAnalytics("s", 30)
    expect(a.operations).toMatchObject({ orders: 4, cancelled: 1, refunded: 1, disputed: 1 })
    expect(a.operations.cancelRate).toBe(0.25)
    expect(a.operations.refundRate).toBe(0.25)
    expect(a.operations.disputeRate).toBe(0.25)
    expect(a.previousOperations.orders).toBe(0)
    expect(a.previousOperations.cancelRate).toBeNull()
  })

  it("entrega no prazo: só conta quem tinha prazo prometido, e mede o tempo médio", async () => {
    await order({ created: 3, delivered: 3, due: 2 }) // dentro do prazo (entregue no mesmo dia, prazo no dia seguinte)
    await order({ created: 3, delivered: 1, due: 2 }) // atrasada
    await order({ created: 3, delivered: 1, due: null }) // automática: fora da conta
    const a = await getSellerAnalytics("s", 30)
    expect(a.operations.deliveriesWithDeadline).toBe(2)
    expect(a.operations.onTimePercent).toBe(50)
    expect(a.operations.avgDeliveryHours).toBeGreaterThan(0)
  })

  it("compradores que voltaram: 2+ vendas concluídas com este vendedor", async () => {
    await order({ buyer: "b1", net: 100, created: 1 })
    await order({ buyer: "b1", net: 200, created: 2 })
    await order({ buyer: "b2", net: 400, created: 3 })
    await order({ buyer: "b3", net: 50, created: 100 }) // fora da janela
    const a = await getSellerAnalytics("s", 30)
    expect(a.buyers).toEqual({ total: 2, returning: 1, revenueCents: 700, returningRevenueCents: 300 })
  })

  it("liberações previstas: pedidos entregues agrupados pelo dia da liberação automática", async () => {
    await order({ status: "entregue", completed: null, delivered: 1, release: -3, net: 400 })
    await order({ status: "entregue", completed: null, delivered: 1, release: -3, net: 100 })
    await order({ status: "entregue", completed: null, delivered: 1, release: -6, net: 250 })
    await order({ status: "aguardando_entrega", completed: null, release: null }) // sem data: fora
    const a = await getSellerAnalytics("s", 30)
    expect(a.releases.map((r) => [r.count, r.cents])).toEqual([[2, 500], [1, 250]])
    expect(a.releases[0].day < a.releases[1].day).toBe(true)
  })

  it("visualizações e conversão: por dia e por anúncio, só do vendedor", async () => {
    await order({ product: p1, created: 0 })
    await order({ product: p1, created: 1 })
    await t.query(`INSERT INTO "product_view_daily" ("productId", "day", "views") VALUES
      ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 30),
      ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1, 20),
      ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date - 40, 10),
      ($2, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 999)`, [p1, p3])
    const a = await getSellerAnalytics("s", 30)
    expect(a.viewsAvailable).toBe(true)
    expect(a.current.views).toBe(50)
    expect(a.previous.views).toBe(10)
    expect(a.current.conversion).toBeCloseTo(2 / 50, 6)
    expect(a.series.at(-1)?.views).toBe(30)
    const row = a.products.find((p) => p.id === p1)!
    expect(row).toMatchObject({ views: 50, orders: 2 })
    expect(row.conversion).toBeCloseTo(0.04, 6)
    expect(a.products.find((p) => p.id === p3)).toBeUndefined()
  })

  it("preço contra o mercado: mediana de anúncios parecidos de OUTROS vendedores; com menos de 3 não compara", async () => {
    await t.query(`UPDATE "product_variant" SET "priceCents" = 8000 WHERE "productId" = $1`, [p1]) // o meu: R$ 80
    const peer = async (seller: string, slug: string, price: number, over: { game?: string; category?: string; status?: string; stock?: number } = {}) => {
      const id = (await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game", "status") VALUES ($1, $2, 'Anúncio do concorrente', $3, $4, $5) RETURNING "id"`, [seller, slug, over.category ?? "contas", over.game ?? "Valorant", over.status ?? "ativo"])).rows[0].id as number
      await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'v', $2, $3)`, [id, price, over.stock ?? 5])
    }
    // p3 (outro vendedor, Valorant/contas, R$ 10) + mais um: só 2 concorrentes → sem comparação
    await t.query(`UPDATE "product_variant" SET "priceCents" = 10000 WHERE "productId" = $1`, [p3])
    await peer("outro", "c2", 12_000)
    let a = await getSellerAnalytics("s", 30)
    let row = a.products.find((p) => p.id === p1)!
    expect(row).toMatchObject({ priceCents: 8000, marketPeers: 2, marketMedianCents: null, priceComparison: null })

    // 3º concorrente entra → mediana de {10000, 12000, 20000} = 12000; meu preço está 33,3% abaixo
    await peer("outro", "c3", 20_000)
    // não contam: outra categoria, outro jogo, pausado, sem estoque, e o meu próprio outro anúncio
    await peer("outro", "c4", 1, { category: "moedas" })
    await peer("outro", "c5", 1, { game: "Roblox" })
    await peer("outro", "c6", 1, { status: "pausado" })
    await peer("outro", "c7", 1, { stock: 0 })
    a = await getSellerAnalytics("s", 30)
    row = a.products.find((p) => p.id === p1)!
    expect(row).toMatchObject({ marketPeers: 3, marketMedianCents: 12_000 })
    expect(row.priceComparison?.verdict).toBe("abaixo")
    expect(row.priceComparison?.pct).toBeCloseTo(-33.33, 1)
    // nada de concorrente no retorno: só números agregados
    expect(JSON.stringify(a)).not.toContain("Anúncio do concorrente")
  })

  it("visualizações recentes por anúncio; nulo se a tabela não existe", async () => {
    await t.query(`INSERT INTO "product_view_daily" ("productId", "day", "views") VALUES
      ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 5),
      ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29, 7),
      ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date - 30, 100),
      ($2, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 3)`, [p1, p3])
    const views = await getRecentViews("s", 30)
    expect(views?.get(p1)).toBe(12) // hoje + há 29 dias; o de há 30 dias fica de fora
    expect(views?.has(p3)).toBe(false) // anúncio de outro vendedor
    await t.query(`ALTER TABLE "product_view_daily" RENAME TO "product_view_daily_off"`)
    try {
      expect(await getRecentViews("s", 30)).toBeNull()
    } finally {
      await t.query(`ALTER TABLE "product_view_daily_off" RENAME TO "product_view_daily"`)
    }
  })

  it("sem a tabela de visualizações (migração pendente) o painel não quebra: sem dados de visita", async () => {
    await order({ net: 1000 })
    await t.query(`ALTER TABLE "product_view_daily" RENAME TO "product_view_daily_off"`)
    try {
      const a = await getSellerAnalytics("s", 30)
      expect(a.viewsAvailable).toBe(false)
      expect(a.current.views).toBeNull()
      expect(a.current.conversion).toBeNull()
      expect(a.series.every((p) => p.views === null)).toBe(true)
      expect(a.products.every((p) => p.views === null && p.conversion === null)).toBe(true)
      expect(a.current.revenueCents).toBe(1000)
    } finally {
      await t.query(`ALTER TABLE "product_view_daily_off" RENAME TO "product_view_daily"`)
    }
  })
})
