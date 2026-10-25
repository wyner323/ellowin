import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/** Acompanhamento da moderação dos vendedores de entrega automática: números por vendedor, sinal de atenção e nomes públicos. */

const holder = vi.hoisted(() => ({ db: null as unknown as TestDb["db"], pool: null as unknown as TestDb["pool"] }))

vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db
  },
  pool: {
    query: (text: string, params?: unknown[]) => holder.pool.query(text, params),
    connect: () => holder.pool.connect(),
  },
}))

import { FLAG_DISPUTE_PERCENT, FLAG_MIN_ORDERS, disputePercent, getAutoDeliverySellers, isFlagged } from "@/lib/auto-delivery-monitor"

let t: TestDb
let variantOf: Record<string, { productId: number; variantId: number }>

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

beforeEach(async () => {
  await t.query(`TRUNCATE "delivery_stock_item", "dispute", "order", "product_variant", "product", "seller_application", "user" RESTART IDENTITY CASCADE`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('s1', 'Ana Maria da Silva', 'a@t.dev', 'AnaGames'), ('s2', 'Bruno Costa Souza', 'b@t.dev', NULL), ('s3', 'Carla Dias Lima', 'c@t.dev', 'CarlaStore'), ('buyer', 'Comprador', 'x@t.dev', 'Comp')`)
  await t.query(`INSERT INTO "seller_application" ("userId", "storeName", "status") VALUES ('s1', 'Loja da Ana', 'aprovado'), ('s2', NULL, 'aprovado'), ('s3', NULL, 'aprovado')`)
  variantOf = {}
  for (const seller of ["s1", "s2", "s3"]) {
    const p = (await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "deliveryType") VALUES ($1, $1 || '-p', 'Gift card', 'gift-cards', 'automatica') RETURNING "id"`, [seller])).rows[0].id as number
    const v = (await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'R$ 50', 5000, 0) RETURNING "id"`, [p])).rows[0].id as number
    variantOf[seller] = { productId: p, variantId: v }
  }
})

/** Um pedido entregue pelo estoque (item vendido ligado ao pedido), opcionalmente com disputa. */
async function sale(seller: string, opts: { dispute?: string; status?: string } = {}) {
  const { productId, variantId } = variantOf[seller]
  const orderId = (await t.query(
    `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "status") VALUES ('buyer', $1, $2, $3, 'x', 'y', 5000, $4) RETURNING "id"`,
    [seller, productId, variantId, opts.status ?? "concluido"],
  )).rows[0].id as number
  await t.query(`INSERT INTO "delivery_stock_item" ("variantId", "sellerId", "payload", "payloadHash", "mask", "orderId", "soldAt") VALUES ($1, $2, NULL, $3, '••••••', $4, now())`, [variantId, seller, `h${orderId}`, orderId])
  if (opts.dispute) {
    await t.query(
      `INSERT INTO "dispute" ("orderId", "openedBy", "reason", "status", "firstContactDueAt", "sellerResponseDueAt", "resolutionDueAt") VALUES ($1, 'buyer', 'diferente', $2, now(), now(), now())`,
      [orderId, opts.dispute],
    )
  }
  return orderId
}

describe("sinal de atenção", () => {
  it("fronteiras: 5 pedidos e 10% de disputas", () => {
    expect(FLAG_MIN_ORDERS).toBe(5)
    expect(FLAG_DISPUTE_PERCENT).toBe(10)
    expect(isFlagged(5, 1)).toBe(true) // 5 pedidos, 20%
    expect(isFlagged(4, 4)).toBe(false) // 100%, mas poucos pedidos
    expect(isFlagged(10, 1)).toBe(true) // 10% exato
    expect(isFlagged(11, 1)).toBe(false) // 9,09%
    expect(disputePercent(0, 0)).toBe(0)
    expect(disputePercent(8, 2)).toBe(25)
  })
})

describe("getAutoDeliverySellers", () => {
  it("conta pedidos, disputas, a favor do comprador e reembolsados por vendedor, com nomes públicos", async () => {
    for (let i = 0; i < 4; i++) await sale("s1")
    await sale("s1", { dispute: "resolvida_comprador", status: "reembolsado" })
    await sale("s1", { dispute: "resolvida_vendedor" })
    await sale("s2")
    const { available, rows } = await getAutoDeliverySellers()
    expect(available).toBe(true)
    const byId = Object.fromEntries(rows.map((r) => [r.sellerId, r]))
    expect(byId.s1).toMatchObject({ name: "Loja da Ana", orders: 6, disputes: 2, buyerWon: 1, refunded: 1 })
    expect(byId.s1.disputePercent).toBeCloseTo(33.33, 1)
    expect(byId.s1.flagged).toBe(true)
    expect(byId.s2.name).toMatch(/^Usuário/) // sem loja nem apelido: rótulo anônimo, nunca o nome legal
    expect(JSON.stringify(rows)).not.toContain("Ana Maria da Silva")
    expect(JSON.stringify(rows)).not.toContain("Bruno Costa")
    expect(byId.s3).toBeUndefined() // sem pedido pelo estoque, não aparece
  })

  it("só conta pedidos entregues pelo estoque: pedido manual do mesmo vendedor fica de fora", async () => {
    await sale("s1")
    const { productId, variantId } = variantOf.s1
    await t.query(`INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "status") VALUES ('buyer', 's1', $1, $2, 'manual', 'y', 5000, 'concluido')`, [productId, variantId])
    expect((await getAutoDeliverySellers()).rows[0].orders).toBe(1)
  })

  it("ordena: em atenção primeiro, depois maior taxa e maior volume", async () => {
    for (let i = 0; i < 9; i++) await sale("s1")
    await sale("s1", { dispute: "aberta" }) // 10 pedidos, 1 disputa: 10% → atenção
    for (let i = 0; i < 12; i++) await sale("s2") // 0%
    for (let i = 0; i < 2; i++) await sale("s3", { dispute: "aberta" }) // 2 pedidos, 100%, mas poucos pedidos
    const { rows } = await getAutoDeliverySellers()
    expect(rows.map((r) => [r.sellerId, r.flagged])).toEqual([["s1", true], ["s3", false], ["s2", false]])
  })

  it("sem a tabela do estoque (migração pendente) avisa que não está disponível", async () => {
    await t.query(`DROP TABLE "delivery_stock_item" CASCADE`)
    expect(await getAutoDeliverySellers()).toEqual({ available: false, rows: [] })
  })
})
