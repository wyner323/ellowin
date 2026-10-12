import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Os números públicos (home, categorias, jogos) saem do banco por SQL cru. A
 * regra do projeto é só exibir o que o banco sustenta, então aqui se confere
 * cada contagem, o menor preço e a média, inclusive o que fica de fora (pedidos
 * de demonstração 1–5, anúncio sem estoque, pausado).
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
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

import { getCategoryStats, getGameStats, getListedGames, getMarketStats } from "@/lib/market-stats"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

beforeEach(async () => {
  await t.query(`TRUNCATE "review", "order", "product_variant", "product", "seller_application", "user" RESTART IDENTITY CASCADE`)
  for (const id of ["ana", "bia", "cadu", "comprador"]) {
    await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $1 || '@teste.dev')`, [id])
  }
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

let n = 0

async function addProduct(opts: { seller?: string; game?: string | null; category?: string; status?: string; variants?: { price: number; stock?: number; active?: boolean }[] } = {}) {
  n++
  const { rows } = await t.query(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game", "status") VALUES ($1, $2, 'Anúncio', $3, $4, $5) RETURNING "id"`,
    [opts.seller ?? "ana", `p-${n}`, opts.category ?? "contas", opts.game === undefined ? "Valorant" : opts.game, opts.status ?? "ativo"],
  )
  const id = rows[0].id as number
  for (const v of opts.variants ?? [{ price: 10_000, stock: 1 }]) {
    await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock", "active") VALUES ($1, 'Item', $2, $3, $4)`, [id, v.price, v.stock ?? 1, v.active ?? true])
  }
  return id
}

async function addOrder(productId: number, opts: { id?: number; status?: string; deliveredAfterMinutes?: number | null } = {}) {
  const { rows: v } = await t.query(`SELECT "id" FROM "product_variant" WHERE "productId" = $1 LIMIT 1`, [productId])
  const delivered = opts.deliveredAfterMinutes === undefined ? 30 : opts.deliveredAfterMinutes
  const { rows } = await t.query(
    `INSERT INTO ${opts.id ? `"order" ("id", ` : `"order" (`}"buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents", "status", "createdAt", "deliveredAt")
     VALUES (${opts.id ? `${opts.id}, ` : ""}'comprador', 'ana', $1, $2, 'x', 'y', 1000, 80, 920, $3, '2026-01-01 10:00:00', ${delivered === null ? "NULL" : `'2026-01-01 10:00:00'::timestamp + make_interval(mins => ${delivered})`})
     RETURNING "id"`,
    [productId, v[0].id, opts.status ?? "concluido"],
  )
  return rows[0].id as number
}

async function addReview(orderId: number, productId: number, rating: number) {
  await t.query(`INSERT INTO "review" ("orderId", "productId", "sellerId", "buyerId", "rating") VALUES ($1, $2, 'ana', 'comprador', $3)`, [orderId, productId, rating])
}

async function approveSeller(id: string, status = "aprovado") {
  await t.query(`INSERT INTO "seller_application" ("userId", "status") VALUES ($1, $2)`, [id, status])
}

/* ---------------------------------------------------------------------------
 * getMarketStats
 * ------------------------------------------------------------------------ */

describe("getMarketStats", () => {
  it("banco vazio: zeros e médias nulas (nunca número inventado)", async () => {
    expect(await getMarketStats()).toEqual({
      activeListings: 0,
      approvedSellers: 0,
      reviewCount: 0,
      ratingAvg: null,
      deliveredOrders: 0,
      avgDeliveryMinutes: null,
    })
  })

  it("anúncios ativos contam só os À VENDA (ativo, com item ativo e em estoque)", async () => {
    await addProduct()
    await addProduct({ status: "pausado" })
    await addProduct({ variants: [{ price: 1_000, stock: 0 }] })
    await addProduct({ variants: [{ price: 1_000, stock: 9, active: false }] })
    await addProduct({ variants: [{ price: 1_000, stock: 0 }, { price: 2_000, stock: 3 }] }) // um item serve
    expect((await getMarketStats()).activeListings).toBe(2)
  })

  it("vendedores aprovados: só candidaturas aprovadas", async () => {
    await approveSeller("ana")
    await approveSeller("bia", "em_andamento")
    await approveSeller("cadu")
    expect((await getMarketStats()).approvedSellers).toBe(2)
  })

  it("avaliações: total e média arredondada em 2 casas", async () => {
    const p = await addProduct()
    const orders = [await addOrder(p), await addOrder(p), await addOrder(p)]
    await addReview(orders[0], p, 5)
    await addReview(orders[1], p, 4)
    await addReview(orders[2], p, 4)
    const s = await getMarketStats()
    expect(s.reviewCount).toBe(3)
    expect(s.ratingAvg).toBe(4.33)
  })

  it("entregas: só pedidos concluídos com entrega registrada, SEM os pedidos de demonstração 1–5", async () => {
    const p = await addProduct()
    for (const id of [1, 2, 3, 4, 5]) await addOrder(p, { id, deliveredAfterMinutes: 5 }) // legado
    await addOrder(p, { id: 6, deliveredAfterMinutes: 30 })
    await addOrder(p, { id: 7, deliveredAfterMinutes: 90 })
    await addOrder(p, { id: 8, status: "aguardando_entrega", deliveredAfterMinutes: null })
    await addOrder(p, { id: 9, status: "reembolsado", deliveredAfterMinutes: 10 })
    await addOrder(p, { id: 10, status: "concluido", deliveredAfterMinutes: null }) // concluído sem data de entrega

    const s = await getMarketStats()
    expect(s.deliveredOrders).toBe(2)
    expect(s.avgDeliveryMinutes).toBe(60) // (30 + 90) / 2, os de demonstração (5 min) não puxam a média
  })

  it("sem entrega real, a média de tempo é nula mesmo com pedidos de demonstração", async () => {
    const p = await addProduct()
    await addOrder(p, { id: 1, deliveredAfterMinutes: 5 })
    const s = await getMarketStats()
    expect(s.deliveredOrders).toBe(0)
    expect(s.avgDeliveryMinutes).toBeNull()
  })

  it("tempo médio com 1 casa decimal", async () => {
    const p = await addProduct()
    await addOrder(p, { id: 6, deliveredAfterMinutes: 10 })
    await addOrder(p, { id: 7, deliveredAfterMinutes: 11 })
    await addOrder(p, { id: 8, deliveredAfterMinutes: 11 })
    expect((await getMarketStats()).avgDeliveryMinutes).toBe(10.7)
  })
})

/* ---------------------------------------------------------------------------
 * getCategoryStats
 * ------------------------------------------------------------------------ */

describe("getCategoryStats", () => {
  it("por categoria: quantidade, menor preço disponível e vendedores distintos", async () => {
    await addProduct({ category: "contas", seller: "ana", variants: [{ price: 9_000 }, { price: 3_000 }] })
    await addProduct({ category: "contas", seller: "ana", variants: [{ price: 5_000 }] })
    await addProduct({ category: "contas", seller: "bia", variants: [{ price: 7_000 }] })
    await addProduct({ category: "moedas", seller: "cadu", variants: [{ price: 1_500 }] })

    expect(await getCategoryStats()).toEqual({
      contas: { count: 3, minPriceCents: 3_000, sellerCount: 2 },
      moedas: { count: 1, minPriceCents: 1_500, sellerCount: 1 },
    })
  })

  it("o menor preço ignora item esgotado/desativado e o que não está à venda some da conta", async () => {
    await addProduct({ category: "contas", variants: [{ price: 100, stock: 0 }, { price: 200, active: false }, { price: 8_000 }] })
    await addProduct({ category: "contas", status: "pausado", variants: [{ price: 50 }] })
    await addProduct({ category: "gift-cards", variants: [{ price: 50, stock: 0 }] })

    expect(await getCategoryStats()).toEqual({ contas: { count: 1, minPriceCents: 8_000, sellerCount: 1 } })
  })

  it("sem anúncios devolve objeto vazio", async () => {
    expect(await getCategoryStats()).toEqual({})
  })
})

/* ---------------------------------------------------------------------------
 * getGameStats
 * ------------------------------------------------------------------------ */

describe("getGameStats", () => {
  it("junta as grafias do mesmo jogo: soma anúncios, menor preço e vendedores sem repetir", async () => {
    await addProduct({ game: "Valorant", seller: "ana", variants: [{ price: 8_000 }] })
    await addProduct({ game: "valorant", seller: "ana", variants: [{ price: 4_000 }] })
    await addProduct({ game: "  VALORANT ", seller: "bia", variants: [{ price: 6_000 }] })
    await addProduct({ game: "Roblox", seller: "cadu", variants: [{ price: 100 }] })

    expect(await getGameStats("valorant")).toEqual({ count: 3, minPriceCents: 4_000, sellerCount: 2 })
    expect(await getGameStats("roblox")).toEqual({ count: 1, minPriceCents: 100, sellerCount: 1 })
  })

  it("jogo sem anúncio à venda devolve nulo (pausado, esgotado e sem jogo não contam)", async () => {
    await addProduct({ game: "Minecraft", status: "pausado" })
    await addProduct({ game: "Minecraft", variants: [{ price: 1_000, stock: 0 }] })
    await addProduct({ game: null })
    expect(await getGameStats("minecraft")).toBeNull()
    expect(await getGameStats("jogo-que-nao-existe")).toBeNull()
  })
})

/* ---------------------------------------------------------------------------
 * getListedGames
 * ------------------------------------------------------------------------ */

describe("getListedGames", () => {
  it("do mais anunciado para o menos, empate por nome, só jogos que têm página, até o limite", async () => {
    for (let i = 0; i < 3; i++) await addProduct({ game: "Valorant" })
    for (let i = 0; i < 2; i++) await addProduct({ game: "Roblox" })
    for (let i = 0; i < 2; i++) await addProduct({ game: "Minecraft" })
    await addProduct({ game: "Steam" })
    await addProduct({ game: "Jogo Que Ninguém Cadastrou No Catálogo" })
    await addProduct({ game: "Fortnite", status: "pausado" })

    const all = await getListedGames()
    expect(all.map((g) => [g.name, g.count])).toEqual([
      ["Valorant", 3],
      ["Minecraft", 2],
      ["Roblox", 2],
      ["Steam", 1],
    ])
    expect(all[0].slug).toBe("valorant")
    expect((await getListedGames(2)).map((g) => g.name)).toEqual(["Valorant", "Minecraft"])
  })
})
