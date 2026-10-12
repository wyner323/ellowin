import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Os outros leitores de `lib/marketplace.ts`: vitrine da home, página do anúncio,
 * perguntas, reputação e entrega do vendedor, painel "Meus anúncios" e loja
 * pública. A busca/filtros/ordenação ficam em `marketplace-search.test.ts`.
 *
 * O que mais importa aqui: o vendedor só enxerga o que é dele, a loja pública só
 * existe para vendedor aprovado e só lista o que está à venda, e o nome legal
 * nunca aparece no lugar do apelido.
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

import {
  getAccountFlagForDispute,
  getProductBySlug,
  getProductForSeller,
  getProductQuestions,
  getRealStorefrontCards,
  getSellerAccountFlagSummary,
  getSellerDeliveryStats,
  getSellerListingSummary,
  getSellerProductsPage,
  getSellerQuestionsPage,
  getSellerRecentReviews,
  getSellerReputationBreakdown,
  getSellerStats,
  getSellerStorefront,
  getSellerUnansweredQuestionsCount,
  getStorefrontCards,
} from "@/lib/marketplace"
import { getCategory, listings as demoListings } from "@/lib/catalog"

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
  await t.query(
    `TRUNCATE "seller_account_flag", "product_question", "review", "dispute", "order", "product_image", "product_variant", "product", "seller_application", "user" RESTART IDENTITY CASCADE`,
  )
  // ana: vendedora aprovada, com loja e apelido. bia: aprovada, sem apelido. cadu: sem candidatura.
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('ana', 'Ana Maria da Silva', 'ana@teste.dev', 'AnaGames')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ('bia', 'Bia Souza', 'bia@teste.dev')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ('cadu', 'Cadu Lima', 'cadu@teste.dev')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('comprador', 'Carlos Pereira Lima', 'carlos@teste.dev', 'CarlosPlay')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ('outro', 'Outro Comprador', 'outro@teste.dev')`)
  await t.query(`INSERT INTO "seller_application" ("userId", "storeName", "storeSlug", "level", "status") VALUES ('ana', 'Loja da Ana', 'loja-da-ana', 4, 'aprovado')`)
  await t.query(`INSERT INTO "seller_application" ("userId", "storeName", "storeSlug", "level", "status") VALUES ('bia', NULL, 'loja-da-bia', 2, 'aprovado')`)
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

let seq = 0
const variantOf = new Map<number, number>()

type ProductOpts = {
  seller?: string
  slug?: string
  title?: string
  category?: string
  game?: string | null
  status?: string
  createdAt?: string
  ratingSum?: number
  ratingCount?: number
  salesCount?: number
  deliveryType?: string
  deliveryTime?: string
  attributes?: Record<string, string>
  accountOrigin?: string | null
  description?: string
}

async function addProduct(opts: ProductOpts = {}) {
  seq++
  const { rows } = await t.query(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game", "status", "createdAt", "ratingSum", "ratingCount", "salesCount", "deliveryType", "deliveryTime", "attributes", "accountOrigin", "description")
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamp, '2026-01-01 10:00:00'::timestamp + make_interval(mins => ${seq})), $8, $9, $10, $11, $12, $13::jsonb, $14, $15)
     RETURNING "id"`,
    [
      opts.seller ?? "ana",
      opts.slug ?? `anuncio-${seq}`,
      opts.title ?? `Anúncio ${seq}`,
      opts.category ?? "contas",
      opts.game === undefined ? "Valorant" : opts.game,
      opts.status ?? "ativo",
      opts.createdAt ?? null,
      opts.ratingSum ?? 0,
      opts.ratingCount ?? 0,
      opts.salesCount ?? 0,
      opts.deliveryType ?? "manual",
      opts.deliveryTime ?? "ate 24h",
      JSON.stringify(opts.attributes ?? {}),
      opts.accountOrigin ?? null,
      opts.description ?? "",
    ],
  )
  return rows[0].id as number
}

async function addVariant(productId: number, v: { label?: string; price?: number; stock?: number; active?: boolean; sortOrder?: number; note?: string | null } = {}) {
  const { rows } = await t.query(
    `INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock", "active", "sortOrder", "deliveryNote") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING "id"`,
    [productId, v.label ?? "Item", v.price ?? 10_000, v.stock ?? 1, v.active ?? true, v.sortOrder ?? 0, v.note ?? null],
  )
  if (!variantOf.has(productId)) variantOf.set(productId, rows[0].id as number)
  return rows[0].id as number
}

/** Anúncio ativo, com um item em estoque (à venda). */
async function addListing(opts: ProductOpts & { price?: number; stock?: number } = {}) {
  const id = await addProduct(opts)
  await addVariant(id, { price: opts.price ?? 10_000, stock: opts.stock ?? 3 })
  return id
}

async function addImage(productId: number, url: string, sortOrder = 0) {
  await t.query(`INSERT INTO "product_image" ("productId", "url", "sortOrder") VALUES ($1, $2, $3)`, [productId, url, sortOrder])
}

let orderTick = 0
async function addOrderRow(
  productId: number,
  opts: { seller?: string; buyer?: string; createdAt?: string; deliveredAt?: string | null; dueAt?: string | null } = {},
) {
  orderTick++
  if (!variantOf.has(productId)) await addVariant(productId, { stock: 0 })
  const { rows } = await t.query(
    `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "status", "createdAt", "deliveredAt", "deliveryDueAt")
     VALUES ($1, $2, $3, $4, 'x', 'y', 1000, 'concluido', COALESCE($5::timestamp, '2026-01-01 10:00:00'::timestamp + make_interval(mins => ${orderTick})), $6::timestamp, $7::timestamp)
     RETURNING "id"`,
    [opts.buyer ?? "comprador", opts.seller ?? "ana", productId, variantOf.get(productId), opts.createdAt ?? null, opts.deliveredAt ?? null, opts.dueAt ?? null],
  )
  return rows[0].id as number
}

async function addReview(productId: number, rating: number, opts: { seller?: string; buyer?: string; createdAt?: string; comment?: string | null } = {}) {
  const orderId = await addOrderRow(productId, { seller: opts.seller, buyer: opts.buyer })
  await t.query(
    `INSERT INTO "review" ("orderId", "productId", "sellerId", "buyerId", "rating", "comment", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamp, now()))`,
    [orderId, productId, opts.seller ?? "ana", opts.buyer ?? "comprador", rating, opts.comment ?? null, opts.createdAt ?? null],
  )
}

async function addQuestion(productId: number, opts: { asker?: string; question?: string; answer?: string | null; createdAt?: string } = {}) {
  const { rows } = await t.query(
    `INSERT INTO "product_question" ("productId", "askerId", "question", "answer", "answeredAt", "createdAt")
     VALUES ($1, $2, $3, $4, CASE WHEN $4::text IS NULL THEN NULL ELSE now() END, COALESCE($5::timestamp, now())) RETURNING "id"`,
    [productId, opts.asker ?? "comprador", opts.question ?? "Tem garantia?", opts.answer ?? null, opts.createdAt ?? null],
  )
  return rows[0].id as number
}

async function addDispute(productId: number, seller = "ana") {
  const orderId = await addOrderRow(productId, { seller })
  const { rows } = await t.query(
    `INSERT INTO "dispute" ("orderId", "openedBy", "reason", "firstContactDueAt", "sellerResponseDueAt", "resolutionDueAt") VALUES ($1, 'comprador', 'diferente', now(), now(), now()) RETURNING "id"`,
    [orderId],
  )
  return rows[0].id as number
}

async function addFlag(sellerId: string, disputeId: number, createdAt?: string) {
  await t.query(
    `INSERT INTO "seller_account_flag" ("sellerId", "disputeId", "moderatorId", "note", "createdAt") VALUES ($1, $2, 'cadu', 'nota', COALESCE($3::timestamp, now()))`,
    [sellerId, disputeId, createdAt ?? null],
  )
}

/* ---------------------------------------------------------------------------
 * Vitrine da home
 * ------------------------------------------------------------------------ */

describe("getRealStorefrontCards / getStorefrontCards", () => {
  it("só anúncio ativo e à venda, do mais novo ao mais antigo, com limite", async () => {
    const velho = await addListing({ createdAt: "2026-01-01 10:00:00" })
    const novo = await addListing({ createdAt: "2026-03-01 10:00:00" })
    await addListing({ status: "pausado" })
    const semEstoque = await addProduct()
    await addVariant(semEstoque, { stock: 0 })
    const semItem = await addProduct()
    expect(semItem).toBeGreaterThan(0)

    const cards = await getRealStorefrontCards(10)
    expect(cards.map((c) => c.key)).toEqual([`real-${novo}`, `real-${velho}`])
    expect((await getRealStorefrontCards(1)).map((c) => c.key)).toEqual([`real-${novo}`])
  })

  it("monta o cartão: menor preço disponível, capa, link, vendedor, estoque e entrega imediata", async () => {
    const id = await addProduct({ title: "Conta Imortal", game: "Valorant", deliveryType: "automatica", deliveryTime: "imediata", ratingSum: 14, ratingCount: 3, salesCount: 7 })
    await addVariant(id, { price: 9_000, stock: 2 })
    await addVariant(id, { price: 4_000, stock: 5 })
    await addVariant(id, { price: 100, stock: 0 }) // esgotado: não define o "a partir de"
    await addVariant(id, { price: 50, stock: 9, active: false }) // desativado: idem, e fora do estoque
    await addImage(id, "https://blob/segunda.webp", 2)
    await addImage(id, "https://blob/capa.webp", 1)
    const [c] = await getRealStorefrontCards(5)
    expect(c).toMatchObject({
      source: "real",
      title: "Conta Imortal",
      priceCents: 4_000,
      imageUrl: "https://blob/capa.webp",
      href: `/produtos/anuncio-${seq}`,
      instant: true,
      stock: 7, // 2 + 5 + 0, o desativado não conta
      ratingCount: 3,
    })
    expect(c.seller).toEqual({ name: "Loja da Ana", level: 4, rating: 4.7, sales: 7 })
  })

  it("sem foto cai na imagem da categoria; sem avaliação a nota é nula", async () => {
    await addListing({ category: "moedas" })
    const [c] = await getRealStorefrontCards(5)
    expect(c.imageUrl).toBe(getCategory("moedas")?.image)
    expect(c.imageUrl).toBeTruthy()
    expect(c.seller.rating).toBeNull()
    expect(c.positivePct).toBeNull()
    expect(c.instant).toBe(false)
  })

  it("nome do vendedor: loja > apelido > nome; sem candidatura, nível 1", async () => {
    await addListing({ seller: "bia" }) // sem nome de loja, sem apelido
    await addListing({ seller: "cadu" }) // sem candidatura
    const cards = await getRealStorefrontCards(5)
    const bia = cards.find((c) => c.seller.name === "Bia Souza")!
    const cadu = cards.find((c) => c.seller.name === "Cadu Lima")!
    expect(bia.seller.level).toBe(2)
    expect(cadu.seller.level).toBe(1)
    expect(JSON.stringify(await getRealStorefrontCards(5))).not.toContain("Ana Maria da Silva")
  })

  it("destaques do jogo: até 2 atributos marcados como destaque", async () => {
    await addListing({ game: "Valorant", attributes: { regiao: "br", rank: "imortal", skins: "30-59" } })
    const [c] = await getRealStorefrontCards(5)
    expect(c.highlights).toEqual(["Brasil", "Imortal"])
  })

  it("percentual positivo só aparece com avaliações suficientes (>= 5)", async () => {
    const id = await addListing({ ratingSum: 22, ratingCount: 5 })
    for (const r of [5, 5, 4, 4, 2]) await addReview(id, r)
    const [c] = await getRealStorefrontCards(5)
    expect(c.positivePct).toBe(80)
  })

  it("getStorefrontCards: reais primeiro, demonstração depois; categoria e texto filtram as duas fontes", async () => {
    const real = await addListing({ category: "contas", title: "Conta Valorant real", game: "Valorant" })
    await addListing({ category: "moedas", title: "Robux reais", game: "Roblox" })

    const todos = await getStorefrontCards()
    const keys = todos.map((c) => c.key)
    expect(keys.slice(0, 2).every((k) => k.startsWith("real-"))).toBe(true)
    expect(todos.filter((c) => c.source === "demo")).toHaveLength(demoListings.length)
    expect(keys.indexOf(`real-${real}`)).toBeLessThan(keys.findIndex((k) => k.startsWith("demo-")))

    const contas = await getStorefrontCards({ categorySlug: "contas" })
    expect(contas.every((c) => c.categorySlug === "contas")).toBe(true)
    expect(contas.some((c) => c.source === "demo")).toBe(true)
    expect(contas.some((c) => c.source === "real")).toBe(true)

    const busca = await getStorefrontCards({ query: "valorant" })
    expect(busca.length).toBeGreaterThan(0)
    expect(busca.every((c) => `${c.title} ${c.game}`.toLowerCase().includes("valorant"))).toBe(true)
    expect(busca.some((c) => c.key === `real-${real}`)).toBe(true)
    expect(busca.some((c) => c.title === "Robux reais")).toBe(false)

    // casa pelo TÍTULO do cartão de demonstração mesmo quando o jogo é outro ("10.000 Robux", jogo Roblox)
    const porTitulo = await getStorefrontCards({ query: "robux" })
    expect(porTitulo.some((c) => c.source === "demo" && c.title.toLowerCase().includes("robux"))).toBe(true)
    // e pelo JOGO quando o título não tem o termo
    const demoPorJogo = demoListings.find((l) => !l.title.toLowerCase().includes(l.game.toLowerCase()))
    if (demoPorJogo) {
      const porJogo = await getStorefrontCards({ query: demoPorJogo.game.toLowerCase() })
      expect(porJogo.some((c) => c.key === `demo-${demoPorJogo.id}`)).toBe(true)
    }
  })

  it("demonstração nunca é clicável", async () => {
    const demo = (await getStorefrontCards()).filter((c) => c.source === "demo")
    expect(demo.length).toBeGreaterThan(0)
    expect(demo.every((c) => c.href === null && c.stock === null && !c.instant)).toBe(true)
  })
})

/* ---------------------------------------------------------------------------
 * Página do anúncio
 * ------------------------------------------------------------------------ */

describe("getProductBySlug", () => {
  it("slug inexistente devolve nulo", async () => {
    expect(await getProductBySlug("nao-existe")).toBeNull()
  })

  it("devolve o anúncio completo", async () => {
    const id = await addProduct({
      slug: "conta-valorant",
      title: "Conta Valorant",
      game: "Valorant",
      description: "Descrição longa",
      deliveryType: "manual",
      deliveryTime: "ate 24h",
      accountOrigin: "criada-pelo-vendedor",
      attributes: { regiao: "br", rank: "ouro" },
      ratingSum: 9,
      ratingCount: 2,
      salesCount: 11,
    })
    await addVariant(id, { label: "Conta A", price: 5_000, stock: 2, note: "Envio por e-mail" })
    const d = await getProductBySlug("conta-valorant")
    expect(d).toMatchObject({
      id,
      slug: "conta-valorant",
      title: "Conta Valorant",
      categorySlug: "contas",
      game: "Valorant",
      description: "Descrição longa",
      deliveryType: "manual",
      deliveryTime: "ate 24h",
      accountOrigin: "criada-pelo-vendedor",
      status: "ativo",
      salesCount: 11,
      rating: 4.5,
      ratingCount: 2,
    })
    expect(d?.attributes).toEqual([
      { key: "regiao", label: "Região da conta", value: "Brasil", highlight: true },
      { key: "rank", label: "Rank atual", value: "Ouro", highlight: true },
    ])
    expect(d?.variants).toEqual([{ id: expect.any(Number), label: "Conta A", priceCents: 5_000, stock: 2, deliveryNote: "Envio por e-mail" }])
    expect(d?.seller).toMatchObject({ id: "ana", name: "Loja da Ana", level: 4, storeSlug: "loja-da-ana" })
  })

  it("nota arredondada em 1 casa; sem avaliação é nula", async () => {
    await addListing({ slug: "a", ratingSum: 14, ratingCount: 3 })
    await addListing({ slug: "b" })
    expect((await getProductBySlug("a"))?.rating).toBe(4.7)
    expect((await getProductBySlug("b"))?.rating).toBeNull()
  })

  it("anúncio pausado ainda abre (a página decide o que mostrar), com o status", async () => {
    await addListing({ slug: "pausado", status: "pausado" })
    expect((await getProductBySlug("pausado"))?.status).toBe("pausado")
  })

  it("itens: só ativos (esgotado ainda aparece), por ordem e depois id", async () => {
    const id = await addProduct({ slug: "itens" })
    await addVariant(id, { label: "C", sortOrder: 2 })
    await addVariant(id, { label: "A", sortOrder: 0 })
    await addVariant(id, { label: "Desativado", sortOrder: 1, active: false })
    await addVariant(id, { label: "B", sortOrder: 0, stock: 0 })
    const d = await getProductBySlug("itens")
    expect(d?.variants.map((v) => v.label)).toEqual(["A", "B", "C"])
  })

  it("fotos em ordem, capa primeiro; sem foto, lista vazia", async () => {
    const id = await addListing({ slug: "fotos" })
    await addListing({ slug: "sem-fotos" })
    await addImage(id, "https://blob/3.webp", 3)
    await addImage(id, "https://blob/1.webp", 1)
    await addImage(id, "https://blob/2.webp", 2)
    expect((await getProductBySlug("fotos"))?.images).toEqual(["https://blob/1.webp", "https://blob/2.webp", "https://blob/3.webp"])
    expect((await getProductBySlug("sem-fotos"))?.images).toEqual([])
  })

  it("vendedor: loja > apelido > nome; sem candidatura, nível 1 e sem página de loja", async () => {
    await addListing({ slug: "da-bia", seller: "bia" })
    await addListing({ slug: "do-cadu", seller: "cadu" })
    const bia = await getProductBySlug("da-bia")
    const cadu = await getProductBySlug("do-cadu")
    expect(bia?.seller).toMatchObject({ name: "Bia Souza", level: 2, storeSlug: "loja-da-bia" })
    expect(cadu?.seller).toMatchObject({ name: "Cadu Lima", level: 1, storeSlug: null })
  })

  it("só aponta para a loja se o vendedor está aprovado", async () => {
    await t.query(`UPDATE "seller_application" SET "status" = 'em_andamento' WHERE "userId" = 'bia'`)
    await addListing({ slug: "da-bia", seller: "bia" })
    expect((await getProductBySlug("da-bia"))?.seller.storeSlug).toBeNull()
  })

  it("avaliações: as 20 mais recentes do anúncio, com apelido; de outros anúncios não entram", async () => {
    const id = await addListing({ slug: "com-avaliacoes" })
    const outro = await addListing({ slug: "outro" })
    for (let i = 0; i < 22; i++) {
      await addReview(id, 5, { createdAt: `2026-02-${String(i + 1).padStart(2, "0")} 10:00:00`, comment: `comentário ${i}` })
    }
    await addReview(outro, 1, { comment: "de outro anúncio" })
    await addReview(id, 3, { buyer: "outro", createdAt: "2026-03-30 10:00:00", comment: "a mais recente" })
    const d = await getProductBySlug("com-avaliacoes")
    expect(d?.reviews).toHaveLength(20)
    expect(d?.reviews[0]).toMatchObject({ rating: 3, comment: "a mais recente", buyerName: "Outro Comprador" })
    expect(d?.reviews[1].buyerName).toBe("CarlosPlay")
    expect(JSON.stringify(d?.reviews)).not.toContain("de outro anúncio")
    expect(JSON.stringify(d?.reviews)).not.toContain("Carlos Pereira Lima")
    const datas = d!.reviews.map((r) => r.createdAt.getTime())
    expect(datas).toEqual([...datas].sort((a, b) => b - a))
  })

  it("reputação do vendedor (positivas 4-5, neutras 3, negativas 1-2) e selo de conta recuperada", async () => {
    const id = await addListing({ slug: "reputacao" })
    for (const r of [5, 4, 4, 3, 2, 1, 1]) await addReview(id, r)
    const disputa = await addDispute(id)
    await addFlag("ana", disputa, "2026-04-01 10:00:00")
    const d = await getProductBySlug("reputacao")
    expect(d?.seller.reputation).toEqual({ positivas: 3, neutras: 1, negativas: 3 })
    expect(d?.seller.accountFlags.count).toBe(1)
    expect(d?.seller.accountFlags.lastFlaggedAt).toBeInstanceOf(Date)
  })
})

/* ---------------------------------------------------------------------------
 * Perguntas
 * ------------------------------------------------------------------------ */

describe("getProductQuestions", () => {
  it("só as do anúncio, mais recentes primeiro, com apelido do autor", async () => {
    const a = await addListing()
    const b = await addListing()
    await addQuestion(a, { question: "velha", createdAt: "2026-01-01 10:00:00" })
    await addQuestion(a, { question: "nova", asker: "outro", answer: "Sim", createdAt: "2026-02-01 10:00:00" })
    await addQuestion(b, { question: "de outro anúncio" })
    const qs = await getProductQuestions(a)
    expect(qs.map((q) => q.question)).toEqual(["nova", "velha"])
    expect(qs[0]).toMatchObject({ answer: "Sim", askerName: "Outro Comprador", askerId: "outro" })
    expect(qs[1]).toMatchObject({ answer: null, askerName: "CarlosPlay", answeredAt: null })
    expect(JSON.stringify(qs)).not.toContain("Carlos Pereira Lima")
  })

  it("no máximo 50", async () => {
    const a = await addListing()
    for (let i = 0; i < 52; i++) await addQuestion(a)
    expect(await getProductQuestions(a)).toHaveLength(50)
  })
})

describe("getSellerUnansweredQuestionsCount", () => {
  it("conta só as sem resposta, de anúncios do vendedor", async () => {
    const minha = await addListing({ seller: "ana" })
    const dela = await addListing({ seller: "bia" })
    await addQuestion(minha)
    await addQuestion(minha)
    await addQuestion(minha, { answer: "respondida" })
    await addQuestion(dela)
    expect(await getSellerUnansweredQuestionsCount("ana")).toBe(2)
    expect(await getSellerUnansweredQuestionsCount("bia")).toBe(1)
    expect(await getSellerUnansweredQuestionsCount("cadu")).toBe(0)
  })
})

describe("getSellerQuestionsPage", () => {
  async function seed() {
    const p = await addListing({ seller: "ana", slug: "meu-anuncio", title: "Meu anúncio" })
    await addImage(p, "https://blob/segunda.webp", 5)
    await addImage(p, "https://blob/capa.webp", 0)
    const outro = await addListing({ seller: "bia", slug: "da-bia", title: "Da Bia" })
    await addQuestion(outro, { question: "pergunta para a Bia" })
    const ids = {
      // respostas em ordem alfabética contrária à data: a ordem tem que ser por data
      respVelha: await addQuestion(p, { question: "respondida velha", answer: "aaa", createdAt: "2026-01-01 10:00:00" }),
      pendVelha: await addQuestion(p, { question: "pendente velha", createdAt: "2026-01-02 10:00:00" }),
      respNova: await addQuestion(p, { question: "respondida nova", answer: "zzz", createdAt: "2026-03-01 10:00:00" }),
      pendNova: await addQuestion(p, { question: "pendente nova", createdAt: "2026-03-02 10:00:00" }),
    }
    return ids
  }

  it("sem filtro: as sem resposta primeiro, cada grupo do mais novo ao mais antigo", async () => {
    const ids = await seed()
    const r = await getSellerQuestionsPage("ana", { page: 1 })
    expect(r.questions.map((q) => q.id)).toEqual([ids.pendNova, ids.pendVelha, ids.respNova, ids.respVelha])
    expect(r.counts).toEqual({ total: 4, pending: 2, answered: 2 })
    expect(r.filtered).toBe(4)
  })

  it("pendentes e respondidas filtram a lista, mas os contadores ignoram o filtro", async () => {
    const ids = await seed()
    const pend = await getSellerQuestionsPage("ana", { filter: "pendentes", page: 1 })
    expect(pend.questions.map((q) => q.id)).toEqual([ids.pendNova, ids.pendVelha])
    expect([pend.filtered, pend.counts.total]).toEqual([2, 4])
    const resp = await getSellerQuestionsPage("ana", { filter: "respondidas", page: 1 })
    expect(resp.questions.map((q) => q.id)).toEqual([ids.respNova, ids.respVelha])
    expect([resp.filtered, resp.counts.answered]).toEqual([2, 2])
  })

  it("traz o anúncio e a capa; nunca mostra pergunta de outro vendedor", async () => {
    await seed()
    const r = await getSellerQuestionsPage("ana", { page: 1 })
    expect(r.questions[0]).toMatchObject({ productTitle: "Meu anúncio", productSlug: "meu-anuncio", productCoverUrl: "https://blob/capa.webp", askerName: "CarlosPlay" })
    expect(JSON.stringify(r.questions)).not.toContain("pergunta para a Bia")
    expect((await getSellerQuestionsPage("cadu", { page: 1 })).counts.total).toBe(0)
  })

  it("pagina de 20 em 20; página além do fim cai na última", async () => {
    const p = await addListing({ seller: "ana" })
    for (let i = 0; i < 21; i++) await addQuestion(p)
    const r = await getSellerQuestionsPage("ana", { page: 9 })
    expect([r.page, r.pages, r.questions.length]).toEqual([2, 2, 1])
  })
})

/* ---------------------------------------------------------------------------
 * Números do vendedor
 * ------------------------------------------------------------------------ */

describe("getSellerStats", () => {
  it("soma por vendedor: nota média, avaliações, vendas e anúncios", async () => {
    await addProduct({ seller: "ana", ratingSum: 9, ratingCount: 2, salesCount: 4 })
    await addProduct({ seller: "ana", ratingSum: 5, ratingCount: 1, salesCount: 6, status: "pausado" })
    await addProduct({ seller: "bia", ratingSum: 1, ratingCount: 1, salesCount: 100 })
    expect(await getSellerStats("ana")).toEqual({ rating: 4.7, ratingCount: 3, salesCount: 10, products: 2 })
  })

  it("sem anúncios: nota nula e zeros", async () => {
    expect(await getSellerStats("cadu")).toEqual({ rating: null, ratingCount: 0, salesCount: 0, products: 0 })
  })
})

describe("getSellerReputationBreakdown", () => {
  it("separa positivas (4-5), neutras (3) e negativas (1-2) só do vendedor", async () => {
    const a = await addListing({ seller: "ana" })
    const b = await addListing({ seller: "bia" })
    for (const r of [5, 4, 3, 3, 2]) await addReview(a, r)
    await addReview(b, 5, { seller: "bia" })
    expect(await getSellerReputationBreakdown("ana")).toEqual({ positivas: 2, neutras: 2, negativas: 1 })
    expect(await getSellerReputationBreakdown("cadu")).toEqual({ positivas: 0, neutras: 0, negativas: 0 })
  })
})

describe("getSellerAccountFlagSummary / getAccountFlagForDispute", () => {
  it("conta os registros do vendedor e devolve a data do mais recente como Date", async () => {
    const p = await addListing({ seller: "ana" })
    const d1 = await addDispute(p)
    const d2 = await addDispute(p)
    const d3 = await addDispute(p)
    await addFlag("ana", d1, "2026-01-10 10:00:00")
    await addFlag("ana", d2, "2026-05-20 10:00:00")
    await addFlag("bia", d3, "2026-09-01 10:00:00")
    const s = await getSellerAccountFlagSummary("ana")
    expect(s.count).toBe(2)
    expect(s.lastFlaggedAt).toBeInstanceOf(Date)
    expect(s.lastFlaggedAt?.toISOString().slice(0, 10)).toBe("2026-05-20")
    expect(await getAccountFlagForDispute(d1)).toBe(true)
    expect(await getAccountFlagForDispute(999)).toBe(false)
    const d4 = await addDispute(p)
    expect(await getAccountFlagForDispute(d4)).toBe(false)
  })

  it("sem registros: zero e data nula", async () => {
    expect(await getSellerAccountFlagSummary("ana")).toEqual({ count: 0, lastFlaggedAt: null })
  })
})

describe("getSellerDeliveryStats", () => {
  it("% no prazo e tempo médio só sobre pedidos entregues COM prazo prometido", async () => {
    const p = await addListing({ seller: "ana" })
    // no prazo (entregue 2h depois, prazo 24h)
    await addOrderRow(p, { createdAt: "2026-01-01 10:00:00", deliveredAt: "2026-01-01 12:00:00", dueAt: "2026-01-02 10:00:00" })
    // no prazo, exatamente no limite (6h depois, prazo 6h)
    await addOrderRow(p, { createdAt: "2026-01-01 10:00:00", deliveredAt: "2026-01-01 16:00:00", dueAt: "2026-01-01 16:00:00" })
    // atrasado (10h depois, prazo 4h)
    await addOrderRow(p, { createdAt: "2026-01-01 10:00:00", deliveredAt: "2026-01-01 20:00:00", dueAt: "2026-01-01 14:00:00" })
    // entrega automática: sem prazo -> fora dos dois números
    await addOrderRow(p, { createdAt: "2026-01-01 10:00:00", deliveredAt: "2026-01-01 10:01:00", dueAt: null })
    // ainda não entregue -> fora
    await addOrderRow(p, { createdAt: "2026-01-01 10:00:00", deliveredAt: null, dueAt: "2026-01-02 10:00:00" })
    // de outro vendedor
    const pb = await addListing({ seller: "bia" })
    await addOrderRow(pb, { seller: "bia", createdAt: "2026-01-01 10:00:00", deliveredAt: "2026-01-05 10:00:00", dueAt: "2026-01-02 10:00:00" })

    const s = await getSellerDeliveryStats("ana")
    expect(s.total).toBe(3)
    expect(s.onTimePercent).toBe(67) // 2 de 3
    expect(s.avgDeliveryHours).toBeCloseTo((2 + 6 + 10) / 3, 5)
  })

  it("sem entregas com prazo: percentual e média nulos", async () => {
    const p = await addListing({ seller: "ana" })
    await addOrderRow(p, { deliveredAt: "2026-01-01 12:00:00", dueAt: null })
    expect(await getSellerDeliveryStats("ana")).toEqual({ total: 0, onTimePercent: null, avgDeliveryHours: null })
    expect(await getSellerDeliveryStats("cadu")).toEqual({ total: 0, onTimePercent: null, avgDeliveryHours: null })
  })
})

describe("getSellerRecentReviews", () => {
  it("as 5 mais recentes do vendedor (ou o limite dado), com apelido do comprador", async () => {
    const p = await addListing({ seller: "ana" })
    const pb = await addListing({ seller: "bia" })
    for (let i = 1; i <= 7; i++) await addReview(p, 5, { createdAt: `2026-02-0${i} 10:00:00`, comment: `c${i}` })
    await addReview(pb, 1, { seller: "bia", comment: "da Bia" })
    const r = await getSellerRecentReviews("ana")
    expect(r.map((x) => x.comment)).toEqual(["c7", "c6", "c5", "c4", "c3"])
    expect(r[0].buyerName).toBe("CarlosPlay")
    expect((await getSellerRecentReviews("ana", 2)).map((x) => x.comment)).toEqual(["c7", "c6"])
    expect(JSON.stringify(r)).not.toContain("da Bia")
  })
})

/* ---------------------------------------------------------------------------
 * Painel "Meus anúncios"
 * ------------------------------------------------------------------------ */

describe("getSellerProductsPage", () => {
  it("só os anúncios do vendedor, do mais novo ao mais antigo, com itens, capa e nota", async () => {
    const velho = await addProduct({ seller: "ana", title: "Velho", createdAt: "2026-01-01 10:00:00", ratingSum: 14, ratingCount: 3 })
    await addVariant(velho, { label: "B", sortOrder: 1 })
    await addVariant(velho, { label: "A", sortOrder: 0, active: false }) // inativo ainda aparece no painel
    await addImage(velho, "https://blob/2.webp", 2)
    await addImage(velho, "https://blob/1.webp", 1)
    const novo = await addProduct({ seller: "ana", title: "Novo", createdAt: "2026-03-01 10:00:00" })
    await addProduct({ seller: "bia", title: "Da Bia" })

    const r = await getSellerProductsPage("ana", { page: 1 })
    expect(r.products.map((p) => p.id)).toEqual([novo, velho])
    expect(r.total).toBe(2)
    const p = r.products.find((x) => x.id === velho)!
    expect(p.variants.map((v) => v.label)).toEqual(["A", "B"])
    expect(p.coverUrl).toBe("https://blob/1.webp")
    expect(p.rating).toBe(4.7)
    expect(r.products.find((x) => x.id === novo)).toMatchObject({ coverUrl: null, rating: null, variants: [] })
  })

  it("empate de data desempata pelo id maior, de forma estável entre páginas", async () => {
    const a = await addProduct({ seller: "ana", createdAt: "2026-02-01 10:00:00" })
    const b = await addProduct({ seller: "ana", createdAt: "2026-02-01 10:00:00" })
    const c = await addProduct({ seller: "ana", createdAt: "2026-02-01 10:00:00" })
    expect((await getSellerProductsPage("ana", { page: 1 })).products.map((p) => p.id)).toEqual([c, b, a])
  })

  it("busca por título (sem diferenciar maiúsculas, com espaços aparados e % _ como texto) e filtro de status", async () => {
    await addProduct({ title: "Conta Valorant Imortal" })
    await addProduct({ title: "Gift Card Steam", status: "pausado" })
    await addProduct({ title: "Promo 100% off" })
    await addProduct({ title: "Promo 1000 off" })
    expect((await getSellerProductsPage("ana", { q: "  valorant ", page: 1 })).total).toBe(1)
    expect((await getSellerProductsPage("ana", { status: "pausado", page: 1 })).products.map((p) => p.title)).toEqual(["Gift Card Steam"])
    expect((await getSellerProductsPage("ana", { status: "ativo", page: 1 })).total).toBe(3)
    expect((await getSellerProductsPage("ana", { q: "100%", page: 1 })).products.map((p) => p.title)).toEqual(["Promo 100% off"])
    expect((await getSellerProductsPage("ana", { q: "_oupa", page: 1 })).total).toBe(0)
    expect((await getSellerProductsPage("ana", { q: "xyz", status: "pausado", page: 1 })).total).toBe(0)
  })

  it("hasAny ignora os filtros: separa 'nenhum anúncio' de 'nenhum resultado'", async () => {
    await addProduct({ title: "Algo" })
    const semResultado = await getSellerProductsPage("ana", { q: "inexistente", page: 1 })
    expect([semResultado.total, semResultado.hasAny]).toEqual([0, true])
    const semAnuncios = await getSellerProductsPage("cadu", { page: 1 })
    expect([semAnuncios.total, semAnuncios.hasAny, semAnuncios.products]).toEqual([0, false, []])
  })

  it("pagina de 20 em 20 sem repetir; página além do fim cai na última", async () => {
    const ids: number[] = []
    for (let i = 0; i < 23; i++) ids.push(await addProduct({ seller: "ana" }))
    const p1 = await getSellerProductsPage("ana", { page: 1 })
    const p2 = await getSellerProductsPage("ana", { page: 2 })
    expect([p1.total, p1.pages, p1.products.length, p2.products.length]).toEqual([23, 2, 20, 3])
    expect([...p1.products, ...p2.products].map((p) => p.id)).toEqual([...ids].reverse())
    expect((await getSellerProductsPage("ana", { page: 99 })).page).toBe(2)
  })
})

describe("getSellerListingSummary", () => {
  it("total, ativos, pausados e ativos SEM estoque", async () => {
    // Desloca os ids das variantes em relação aos dos anúncios: uma subquery que correlacionasse
    // com a coluna errada só passaria quando os dois ids coincidem por acaso.
    const calco = await addProduct({ seller: "outro", slug: "calco" })
    for (let i = 0; i < 7; i++) await addVariant(calco)
    await addListing({ seller: "ana" }) // ativo com estoque
    const semEstoque = await addProduct({ seller: "ana" })
    await addVariant(semEstoque, { stock: 0 })
    await addProduct({ seller: "ana" }) // ativo sem nenhum item
    const desativado = await addProduct({ seller: "ana" })
    await addVariant(desativado, { stock: 5, active: false }) // item desativado não conta como estoque
    await addListing({ seller: "ana", status: "pausado", stock: 0 }) // pausado nunca conta como sem estoque
    await addListing({ seller: "bia" })
    expect(await getSellerListingSummary("ana")).toEqual({ total: 5, active: 4, paused: 1, outOfStock: 3 })
    expect(await getSellerListingSummary("cadu")).toEqual({ total: 0, active: 0, paused: 0, outOfStock: 0 })
  })
})

describe("getProductForSeller", () => {
  it("devolve o anúncio com TODOS os itens (inclusive desativados) e as fotos em ordem", async () => {
    const id = await addProduct({ seller: "ana", title: "Meu" })
    await addVariant(id, { label: "B", sortOrder: 1 })
    await addVariant(id, { label: "A", sortOrder: 0, active: false })
    await addImage(id, "https://blob/2.webp", 2)
    await addImage(id, "https://blob/1.webp", 1)
    const p = await getProductForSeller("ana", id)
    expect(p?.title).toBe("Meu")
    expect(p?.variants.map((v) => v.label)).toEqual(["A", "B"])
    expect(p?.images).toEqual(["https://blob/1.webp", "https://blob/2.webp"])
  })

  it("anúncio de OUTRO vendedor ou inexistente devolve nulo", async () => {
    const id = await addProduct({ seller: "ana" })
    expect(await getProductForSeller("bia", id)).toBeNull()
    expect(await getProductForSeller("ana", 999)).toBeNull()
  })
})

/* ---------------------------------------------------------------------------
 * Loja pública
 * ------------------------------------------------------------------------ */

describe("getSellerStorefront", () => {
  it("slug inexistente ou vendedor não aprovado: nulo", async () => {
    expect(await getSellerStorefront("nao-existe")).toBeNull()
    await t.query(`UPDATE "seller_application" SET "status" = 'em_andamento' WHERE "userId" = 'ana'`)
    expect(await getSellerStorefront("loja-da-ana")).toBeNull()
  })

  it("acha o slug sem diferenciar maiúsculas", async () => {
    expect((await getSellerStorefront("LOJA-da-ANA"))?.sellerId).toBe("ana")
  })

  it("perfil: nome da loja, imagem, bio, nível e cor", async () => {
    await t.query(`UPDATE "user" SET "image" = 'https://blob/foto.webp', "bio" = 'Vendo contas', "bannerUrl" = 'https://blob/banner.webp', "accentColor" = '#ff0000' WHERE "id" = 'ana'`)
    const s = await getSellerStorefront("loja-da-ana")
    expect(s).toMatchObject({
      sellerId: "ana",
      name: "Loja da Ana",
      image: "https://blob/foto.webp",
      bio: "Vendo contas",
      bannerUrl: "https://blob/banner.webp",
      accentColor: "#ff0000",
      level: 4,
    })
    expect(s?.memberSince).toBeInstanceOf(Date)
  })

  it("nome: loja > apelido > nome; nunca o nome legal quando há apelido", async () => {
    await t.query(`UPDATE "seller_application" SET "storeName" = NULL WHERE "userId" = 'ana'`)
    expect((await getSellerStorefront("loja-da-ana"))?.name).toBe("AnaGames")
    expect((await getSellerStorefront("loja-da-bia"))?.name).toBe("Bia Souza")
  })

  it("lista só anúncios À VENDA do vendedor (ativo, com item ativo em estoque), mais novos primeiro", async () => {
    const velho = await addListing({ seller: "ana", createdAt: "2026-01-01 10:00:00" })
    const novo = await addListing({ seller: "ana", createdAt: "2026-03-01 10:00:00" })
    await addListing({ seller: "ana", status: "pausado" })
    await addListing({ seller: "ana", stock: 0 })
    const semItem = await addProduct({ seller: "ana" })
    expect(semItem).toBeGreaterThan(0)
    await addListing({ seller: "bia" })
    const s = await getSellerStorefront("loja-da-ana")
    expect(s?.products.map((p) => p.key)).toEqual([`real-${novo}`, `real-${velho}`])
  })

  it("o cartão mostra a reputação da LOJA (não a nota isolada do anúncio)", async () => {
    await addListing({ seller: "ana", ratingSum: 5, ratingCount: 1, salesCount: 3 })
    await addProduct({ seller: "ana", ratingSum: 8, ratingCount: 2, salesCount: 7, status: "pausado" })
    const s = await getSellerStorefront("loja-da-ana")
    expect(s?.stats).toEqual({ rating: 4.3, ratingCount: 3, salesCount: 10, products: 2 })
    expect(s?.products[0].seller).toEqual({ name: "Loja da Ana", level: 4, rating: 4.3, sales: 10 })
  })

  it("junta reputação, avaliações recentes, entrega e selo de conta recuperada", async () => {
    const p = await addListing({ seller: "ana" })
    for (const r of [5, 4, 3, 1]) await addReview(p, r)
    await addOrderRow(p, { createdAt: "2026-01-01 10:00:00", deliveredAt: "2026-01-01 12:00:00", dueAt: "2026-01-02 10:00:00" })
    const disputa = await addDispute(p)
    await addFlag("ana", disputa)
    const s = await getSellerStorefront("loja-da-ana")
    expect(s?.reputation).toEqual({ positivas: 2, neutras: 1, negativas: 1 })
    expect(s?.recentReviews).toHaveLength(4)
    expect(s?.delivery).toMatchObject({ total: 1, onTimePercent: 100 })
    expect(s?.accountFlags.count).toBe(1)
  })

  it("selos: 'sem disputas' só com 5+ vendas e nenhuma disputa; disputa em qualquer pedido do vendedor tira o selo", async () => {
    const p = await addListing({ seller: "ana", salesCount: 12 })
    expect((await getSellerStorefront("loja-da-ana"))?.badges).toEqual(["vendas_10", "sem_disputas"])
    await addDispute(p)
    expect((await getSellerStorefront("loja-da-ana"))?.badges).toEqual(["vendas_10"])
    // disputa de OUTRO vendedor não afeta a Ana
    const pb = await addListing({ seller: "bia", salesCount: 12 })
    expect(pb).toBeGreaterThan(0)
    expect((await getSellerStorefront("loja-da-bia"))?.badges).toEqual(["vendas_10", "sem_disputas"])
  })

  it("loja sem nada à venda existe, só vazia", async () => {
    const s = await getSellerStorefront("loja-da-ana")
    expect(s?.products).toEqual([])
    expect(s?.stats).toEqual({ rating: null, ratingCount: 0, salesCount: 0, products: 0 })
    expect(s?.badges).toEqual([])
  })
})
