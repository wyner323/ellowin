import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Categorias que exigem aprovação do vendedor, análise do estoque novo (lotes) e dados do comprador na compra, contra um Postgres
 * em memória com as migrações reais. Sessão, cache e e-mails são simulados; lib/session.ts, lib/roles.ts, a carteira e as regras
 * de categoria são o código de verdade. Cada regra de segurança foi quebrada de propósito para o teste correspondente falhar.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
  categoryNotices: [] as Record<string, unknown>[],
  stockNotices: [] as number[],
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
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/server", () => ({ after: () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@vercel/blob", () => ({ del: async () => {} }))
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }))
vi.mock("@/lib/notify", () => ({
  notifyOrder: () => {},
  notifyLowStock: () => {},
  notifyPriceChange: () => {},
  notifyCategoryDecision: (input: Record<string, unknown>) => {
    holder.categoryNotices.push(input)
  },
  notifyStockDecision: (batchId: number) => {
    holder.stockNotices.push(batchId)
  },
}))

import { decideCategoryApproval, requestCategoryApproval, setStockReview } from "@/app/actions/category-approval"
import { addStock } from "@/app/actions/delivery-stock"
import { confirmReceipt, purchase } from "@/app/actions/orders"
import { createProduct, duplicateProduct, toggleProductStatus, updateProduct } from "@/app/actions/products"
import { reviewStockBatch } from "@/app/actions/stock-review"
import { getOrderBuyerInfo } from "@/lib/buyer-info"
import { sellableCategorySlugs, sellerMayList } from "@/lib/category-approval"
import { listApprovalQueue } from "@/lib/category-approval"
import { runWalletReconciliation } from "@/lib/reconcile"
import { creditAvailable, withTransaction } from "@/lib/wallet"
import { getProductStock } from "@/lib/delivery-stock"
import { listStockBatches } from "@/lib/stock-review"

let t: TestDb

const KEY = Buffer.alloc(32, 5).toString("base64")
const STATEMENT = "Compro os cartões no distribuidor X, com nota fiscal, e revendo."

beforeAll(async () => {
  vi.stubEnv("DELIVERY_ENCRYPTION_KEY", KEY)
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  vi.unstubAllEnvs()
  await t.close()
})

async function addUser(id: string, { seller = false, role = "user", emailVerified = true } = {}) {
  await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified", "role") VALUES ($1, $1, $1 || '@teste.dev', $2, $3)`, [id, emailVerified, role])
  await t.query(`INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "birthDate") VALUES ($1, $1, '52998224725', '11999999999', '1990-01-01')`, [id])
  if (seller) await t.query(`INSERT INTO "seller_application" ("userId", "status", "storeName", "storeSlug") VALUES ($1, 'aprovado', 'Loja ' || $1, $1 || '-store')`, [id])
}

async function rows<T = Record<string, unknown>>(text: string, params?: unknown[]) {
  return (await t.query(text, params)).rows as T[]
}
async function one<T = Record<string, unknown>>(text: string, params?: unknown[]) {
  return (await rows<T>(text, params))[0]
}

beforeEach(async () => {
  vi.stubEnv("DELIVERY_ENCRYPTION_KEY", KEY)
  holder.userId = null
  holder.categoryNotices.length = 0
  holder.stockNotices.length = 0
  await t.query(
    `TRUNCATE "auth_attempt", "delivery_stock_item", "stock_batch", "order_buyer_info", "seller_category_approval", "wallet_transaction", "order_message", "dispute_message", "dispute", "order", "product_image", "product_variant", "product", "wallet", "seller_application", "profile", "user" RESTART IDENTITY CASCADE`,
  )
  await t.query(`SELECT setval(pg_get_serial_sequence('"order"', 'id'), 100)`)
  await addUser("ana", { seller: true })
  await addUser("bia", { seller: true })
  await addUser("buyer")
  await addUser("buyer2")
  await addUser("mod", { role: "moderator" })
  await addUser("comum")
  for (const id of ["buyer", "buyer2"]) await withTransaction((c) => creditAvailable(c, id, 100_000, "deposito", "Depósito de teste"))
})

/** Aprovação direta no banco (a decisão da moderação tem os próprios testes). */
async function approve(userId: string, categorySlug: string, stockReview = true) {
  await t.query(
    `INSERT INTO "seller_category_approval" ("userId", "categorySlug", "status", "statement", "decidedBy", "decidedAt", "stockReview")
     VALUES ($1, $2, 'aprovado', 'teste', 'teste', now(), $3)
     ON CONFLICT ("userId", "categorySlug") DO UPDATE SET "status" = 'aprovado', "stockReview" = EXCLUDED."stockReview"`,
    [userId, categorySlug, stockReview],
  )
}

/** Anúncio direto no banco, com um item de R$ 50,00. */
async function listing(opts: { sellerId?: string; category?: string; deliveryType?: string; stock?: number } = {}) {
  const automatic = (opts.deliveryType ?? "automatica") === "automatica"
  const p = await one<{ id: number }>(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "deliveryType", "deliveryTime", "status")
     VALUES ($1, 'p-' || gen_random_uuid()::text, 'Anúncio de teste', $2, $3, $4, 'ativo') RETURNING "id"`,
    [opts.sellerId ?? "ana", opts.category ?? "gift-cards", opts.deliveryType ?? "automatica", automatic ? "Imediata (entrega automática)" : "Até 24 horas"],
  )
  const v = await one<{ id: number }>(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'R$ 50', 5000, $2) RETURNING "id"`, [p.id, opts.stock ?? 0])
  return { productId: p.id, variantId: v.id }
}

const stockOf = async (variantId: number) => (await one<{ stock: number }>(`SELECT "stock" FROM "product_variant" WHERE "id" = $1`, [variantId])).stock
const wallet = (id: string) => one<{ availableCents: number; heldCents: number }>(`SELECT "availableCents", "heldCents" FROM "wallet" WHERE "userId" = $1`, [id])

async function sendStock(variantId: number, items: string[], as = "ana", statement?: string) {
  holder.userId = as
  return addStock(variantId, items.join("\n"), statement)
}

async function buy(variantId: number, as = "buyer", info?: Record<string, string>) {
  holder.userId = as
  return purchase(variantId, 5000, info)
}

function newListing(overrides: Record<string, unknown> = {}) {
  return {
    title: "Assinatura Spotify 12 meses",
    categorySlug: "assinaturas",
    game: "Spotify",
    description: "Código de assinatura com 12 meses, entregue no pedido.",
    deliveryType: "manual",
    deliveryTime: "Até 24 horas",
    variants: [{ label: "12 meses", price: "99,90", stock: "3" }],
    ...overrides,
  } as Parameters<typeof createProduct>[0]
}

describe("pedido de aprovação numa categoria", () => {
  it("só categoria restrita pede aprovação, e a explicação tem tamanho mínimo", async () => {
    holder.userId = "ana"
    expect(await requestCategoryApproval({ categorySlug: "contas", statement: STATEMENT })).toMatchObject({ ok: false, field: "categorySlug" })
    expect(await requestCategoryApproval({ categorySlug: "inventada", statement: STATEMENT })).toMatchObject({ ok: false, field: "categorySlug" })
    expect(await requestCategoryApproval({ categorySlug: "gift-cards", statement: "curto" })).toMatchObject({ ok: false, field: "statement" })
    expect(await requestCategoryApproval({ categorySlug: "gift-cards", statement: "x".repeat(601) })).toMatchObject({ ok: false, field: "statement" })
    expect(await rows(`SELECT 1 FROM "seller_category_approval"`)).toHaveLength(0)
  })

  it("só vendedor aprovado e com e-mail confirmado pede", async () => {
    holder.userId = "comum"
    expect(await requestCategoryApproval({ categorySlug: "gift-cards", statement: STATEMENT })).toMatchObject({ ok: false })
    await addUser("sem-email", { seller: true, emailVerified: false })
    holder.userId = "sem-email"
    expect(await requestCategoryApproval({ categorySlug: "gift-cards", statement: STATEMENT })).toMatchObject({ ok: false, field: "email" })
    expect(await rows(`SELECT 1 FROM "seller_category_approval"`)).toHaveLength(0)
  })

  it("cria o pedido pendente, e pedir de novo só atualiza a explicação", async () => {
    holder.userId = "ana"
    expect((await requestCategoryApproval({ categorySlug: "gift-cards", statement: STATEMENT })).ok).toBe(true)
    expect((await requestCategoryApproval({ categorySlug: "gift-cards", statement: STATEMENT + " Atualizado." })).ok).toBe(true)
    const all = await rows<{ status: string; statement: string }>(`SELECT * FROM "seller_category_approval"`)
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ status: "pendente", statement: STATEMENT + " Atualizado." })
  })

  it("quem já está aprovado não pede de novo e nada muda", async () => {
    await approve("ana", "gift-cards", false)
    holder.userId = "ana"
    const r = await requestCategoryApproval({ categorySlug: "gift-cards", statement: STATEMENT })
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("já está aprovado") })
    expect(await one(`SELECT "status", "stockReview" FROM "seller_category_approval"`)).toMatchObject({ status: "aprovado", stockReview: false })
  })

  it("limita os pedidos por hora", async () => {
    holder.userId = "ana"
    let last = { ok: true } as Awaited<ReturnType<typeof requestCategoryApproval>>
    for (let i = 0; i < 11; i++) last = await requestCategoryApproval({ categorySlug: "gift-cards", statement: STATEMENT })
    expect(last).toMatchObject({ ok: false, error: expect.stringContaining("Muitos pedidos") })
  })
})

describe("decisão da moderação", () => {
  async function pedido(userId = "ana", categorySlug = "gift-cards") {
    holder.userId = userId
    await requestCategoryApproval({ categorySlug, statement: STATEMENT })
    return (await one<{ id: number }>(`SELECT "id" FROM "seller_category_approval" WHERE "userId" = $1 AND "categorySlug" = $2`, [userId, categorySlug])).id
  }

  it("só a moderação decide (usuário comum e vendedor não)", async () => {
    const approvalId = await pedido()
    for (const who of ["comum", "ana", null]) {
      holder.userId = who
      await expect(decideCategoryApproval({ approvalId, decision: "aprovado" })).rejects.toThrow()
    }
    expect(await one(`SELECT "status" FROM "seller_category_approval"`)).toMatchObject({ status: "pendente" })
  })

  it("aprovar libera anúncio novo na categoria e avisa o vendedor", async () => {
    const approvalId = await pedido("ana", "assinaturas")
    holder.userId = "ana"
    expect(await createProduct(newListing())).toMatchObject({ ok: false, field: "categorySlug" })

    holder.userId = "mod"
    expect((await decideCategoryApproval({ approvalId, decision: "aprovado" })).ok).toBe(true)
    expect(holder.categoryNotices).toHaveLength(1)
    expect(holder.categoryNotices[0]).toMatchObject({ userId: "ana", categorySlug: "assinaturas", decision: "aprovado" })

    holder.userId = "ana"
    expect((await createProduct(newListing())).ok).toBe(true)
    expect(await sellableCategorySlugs("ana")).toContain("assinaturas")
    expect(await sellableCategorySlugs("bia")).not.toContain("assinaturas")
  })

  it("recusar exige o motivo, deixa a decisão registrada e o vendedor pode pedir de novo", async () => {
    const approvalId = await pedido()
    holder.userId = "mod"
    expect(await decideCategoryApproval({ approvalId, decision: "recusado", note: "" })).toMatchObject({ ok: false, field: "note" })
    expect((await decideCategoryApproval({ approvalId, decision: "recusado", note: "Sem comprovante da origem" })).ok).toBe(true)
    expect(await one(`SELECT "status", "decisionNote", "decidedBy" FROM "seller_category_approval"`)).toMatchObject({ status: "recusado", decisionNote: "Sem comprovante da origem", decidedBy: "mod" })

    holder.userId = "ana"
    expect((await requestCategoryApproval({ categorySlug: "gift-cards", statement: STATEMENT })).ok).toBe(true)
    expect(await one(`SELECT "status", "decisionNote" FROM "seller_category_approval"`)).toMatchObject({ status: "pendente", decisionNote: null })
  })

  it("revogar uma aprovação pausa os anúncios ativos da categoria (e só os dela) e a compra deixa de passar", async () => {
    await approve("ana", "gift-cards", false)
    const gift = await listing({ category: "gift-cards", stock: 2 })
    const outra = await listing({ category: "moedas", deliveryType: "manual", stock: 2 })
    const deBia = await listing({ sellerId: "bia", category: "moedas", deliveryType: "manual", stock: 2 })
    const approvalId = (await one<{ id: number }>(`SELECT "id" FROM "seller_category_approval"`)).id

    holder.userId = "mod"
    expect((await decideCategoryApproval({ approvalId, decision: "recusado", note: "Reclamações de código inválido" })).ok).toBe(true)

    const status = async (id: number) => (await one<{ status: string }>(`SELECT "status" FROM "product" WHERE "id" = $1`, [id])).status
    expect(await status(gift.productId)).toBe("pausado")
    expect(await status(outra.productId)).toBe("ativo")
    expect(await status(deBia.productId)).toBe("ativo")

    // reativar também não passa, e mesmo um anúncio reativado à força não vende (a compra confere a aprovação)
    holder.userId = "ana"
    expect(await toggleProductStatus(gift.productId)).toMatchObject({ ok: false, error: expect.stringContaining("aprovação") })
    await t.query(`UPDATE "product" SET "status" = 'ativo' WHERE "id" = $1`, [gift.productId])
    const r = await buy(gift.variantId)
    expect(r).toMatchObject({ ok: false, error: "Este item não está mais disponível." })
    expect((await wallet("buyer")).availableCents).toBe(100_000)
  })

  it("ligar e desligar a análise do estoque novo é só da moderação e só de vendedor aprovado", async () => {
    await approve("ana", "gift-cards", true)
    const approvalId = (await one<{ id: number }>(`SELECT "id" FROM "seller_category_approval"`)).id
    holder.userId = "ana"
    await expect(setStockReview({ approvalId, stockReview: false })).rejects.toThrow()
    holder.userId = "mod"
    expect((await setStockReview({ approvalId, stockReview: false })).ok).toBe(true)
    expect(await one(`SELECT "stockReview" FROM "seller_category_approval"`)).toMatchObject({ stockReview: false })

    holder.userId = "ana"
    const pend = await pedido("bia")
    holder.userId = "mod"
    expect(await setStockReview({ approvalId: pend, stockReview: false })).toMatchObject({ ok: false })
  })

  it("a fila mostra pendentes primeiro, com vendas concluídas do vendedor", async () => {
    await pedido("ana")
    await approve("bia", "keys")
    const queue = await listApprovalQueue()
    expect(queue.available).toBe(true)
    expect(queue.pending.map((p) => p.userId)).toEqual(["ana"])
    expect(queue.decided.map((p) => p.userId)).toEqual(["bia"])
    expect(queue.pending[0]).toMatchObject({ completedSales: 0, storeName: "Loja ana" })
  })
})

describe("onde a aprovação é exigida", () => {
  it("criar anúncio, mudar a categoria de um anúncio e duplicar", async () => {
    holder.userId = "ana"
    expect(await createProduct(newListing({ categorySlug: "recargas", game: "Free Fire", title: "Recarga Free Fire por ID" }))).toMatchObject({ ok: false, field: "categorySlug" })

    // um anúncio livre não pode virar restrito por edição
    holder.userId = "ana"
    const ok = await createProduct(newListing({ categorySlug: "itens", game: "Valorant", title: "Skin de Valorant rara" }))
    expect(ok.ok).toBe(true)
    const product = await one<{ id: number }>(`SELECT "id" FROM "product" LIMIT 1`)
    const edit = {
      productId: product.id,
      title: "Skin de Valorant rara",
      categorySlug: "keys",
      game: "Valorant",
      description: "Chave de ativação entregue no pedido, conforme descrito.",
      deliveryType: "manual",
      deliveryTime: "Até 24 horas",
      variants: [{ label: "Chave", price: "50,00", stock: "1" }],
    }
    expect(await updateProduct(edit)).toMatchObject({ ok: false, field: "categorySlug" })
    expect(await one(`SELECT "categorySlug" FROM "product" WHERE "id" = $1`, [product.id])).toMatchObject({ categorySlug: "itens" })

    // duplicar um anúncio restrito de quem não está (mais) aprovado
    const restrito = await listing({ category: "gift-cards", deliveryType: "manual", stock: 1 })
    expect(await duplicateProduct(restrito.productId)).toMatchObject({ ok: false, error: expect.stringContaining("aprovação") })
  })

  it("só a categoria aprovada: aprovar gift cards não libera chaves", async () => {
    await approve("ana", "gift-cards")
    expect(await sellerMayList("ana", "gift-cards")).toBe(true)
    expect(await sellerMayList("ana", "keys")).toBe(false)
    expect(await sellerMayList("ana", "contas")).toBe(true)
    expect(await sellerMayList("bia", "gift-cards")).toBe(false)
  })
})

describe("análise do estoque novo (lotes)", () => {
  it("lote de vendedor com análise ligada fica pendente: não vende, o estoque do anúncio não sobe e o aviso fala em análise", async () => {
    await approve("ana", "gift-cards", true)
    const { variantId } = await listing()
    const r = await sendStock(variantId, ["CODE-AAAA-1111", "CODE-BBBB-2222"], "ana", "Distribuidor X, nota 123")
    expect(r.ok, r.error).toBe(true)
    expect(r.message).toContain("análise da moderação")
    expect(await stockOf(variantId)).toBe(0)
    expect(await one(`SELECT "status", "itemCount", "statement" FROM "stock_batch"`)).toMatchObject({ status: "pendente", itemCount: 2, statement: "Distribuidor X, nota 123" })

    const sold = await buy(variantId)
    expect(sold).toMatchObject({ ok: false, error: "Item esgotado." })
    expect((await wallet("buyer")).availableCents).toBe(100_000)

    const summary = await getProductStock("ana", (await one<{ id: number }>(`SELECT "productId" AS id FROM "product_variant" WHERE "id" = $1`, [variantId])).id)
    expect(summary?.[0]).toMatchObject({ available: 0, held: 2, sold: 0 })
    expect(summary?.[0].batches[0]).toMatchObject({ status: "pendente", itemCount: 2 })
  })

  it("sem análise (dispensada) o lote já entra aprovado e vende", async () => {
    await approve("ana", "gift-cards", false)
    const { variantId } = await listing()
    const r = await sendStock(variantId, ["CODE-AAAA-1111"])
    expect(r.message).not.toContain("análise")
    expect(await one(`SELECT "status" FROM "stock_batch"`)).toMatchObject({ status: "aprovado" })
    expect(await stockOf(variantId)).toBe(1)
    expect((await buy(variantId)).ok).toBe(true)
  })

  it("categoria sem análise (contas) nunca pendura lote", async () => {
    const { variantId } = await listing({ category: "contas" })
    const r = await sendStock(variantId, ["login: a / senha: b"])
    expect(r.ok, r.error).toBe(true)
    expect(await one(`SELECT "status" FROM "stock_batch"`)).toMatchObject({ status: "aprovado" })
  })

  it("aprovar põe os itens à venda e a entrega funciona; o dinheiro fecha", async () => {
    await approve("ana", "gift-cards", true)
    const { variantId } = await listing()
    await sendStock(variantId, ["CODE-AAAA-1111", "CODE-BBBB-2222"])
    const batchId = (await one<{ id: number }>(`SELECT "id" FROM "stock_batch"`)).id

    holder.userId = "mod"
    expect((await reviewStockBatch({ batchId, decision: "aprovado" })).ok).toBe(true)
    expect(holder.stockNotices).toEqual([batchId])
    expect(await stockOf(variantId)).toBe(2)

    const first = await buy(variantId)
    expect(first.ok, first.error).toBe(true)
    holder.userId = "buyer"
    expect((await confirmReceipt(first.orderId!)).ok).toBe(true)
    expect(await stockOf(variantId)).toBe(1)
    expect((await runWalletReconciliation()).findings).toEqual([])
  })

  it("só a moderação decide, o lote só aceita as transições válidas e recusar exige o motivo", async () => {
    await approve("ana", "gift-cards", true)
    const { variantId } = await listing()
    await sendStock(variantId, ["CODE-AAAA-1111"])
    const batchId = (await one<{ id: number }>(`SELECT "id" FROM "stock_batch"`)).id

    for (const who of ["ana", "comum", null]) {
      holder.userId = who
      await expect(reviewStockBatch({ batchId, decision: "aprovado" })).rejects.toThrow()
    }

    holder.userId = "mod"
    expect(await reviewStockBatch({ batchId, decision: "recusado" })).toMatchObject({ ok: false, field: "note" })
    expect(await reviewStockBatch({ batchId, decision: "quarentena", note: "teste de transição" })).toMatchObject({ ok: false })
    expect((await reviewStockBatch({ batchId, decision: "aprovado" })).ok).toBe(true)
    expect(await reviewStockBatch({ batchId, decision: "aprovado" })).toMatchObject({ ok: false })
    expect(await reviewStockBatch({ batchId: 99999, decision: "aprovado" })).toMatchObject({ ok: false })
  })

  it("recusar apaga os itens ainda não vendidos do lote e mantém o que já foi vendido", async () => {
    await approve("ana", "gift-cards", true)
    const { variantId } = await listing()
    await sendStock(variantId, ["CODE-AAAA-1111", "CODE-BBBB-2222", "CODE-CCCC-3333"])
    const batchId = (await one<{ id: number }>(`SELECT "id" FROM "stock_batch"`)).id
    holder.userId = "mod"
    await reviewStockBatch({ batchId, decision: "aprovado" })
    const sold = await buy(variantId)
    expect(sold.ok).toBe(true)

    // lote aprovado vai à quarentena e depois é recusado: os 2 não vendidos somem, o vendido fica
    holder.userId = "mod"
    expect((await reviewStockBatch({ batchId, decision: "quarentena", note: "denúncia de código inválido" })).ok).toBe(true)
    expect(await stockOf(variantId)).toBe(0)
    expect((await reviewStockBatch({ batchId, decision: "recusado", note: "origem não comprovada" })).ok).toBe(true)
    expect(await rows(`SELECT "orderId" FROM "delivery_stock_item"`)).toEqual([{ orderId: sold.orderId }])
    expect(await stockOf(variantId)).toBe(0)
    expect(await reviewStockBatch({ batchId, decision: "aprovado" })).toMatchObject({ ok: false })
    expect((await runWalletReconciliation()).findings).toEqual([])
  })

  it("quarentena tira o resto do lote da venda sem apagar, e aprovar de novo devolve", async () => {
    await approve("ana", "gift-cards", false)
    const { variantId } = await listing()
    await sendStock(variantId, ["CODE-AAAA-1111", "CODE-BBBB-2222"])
    const batchId = (await one<{ id: number }>(`SELECT "id" FROM "stock_batch"`)).id
    expect(await stockOf(variantId)).toBe(2)

    holder.userId = "mod"
    expect((await reviewStockBatch({ batchId, decision: "quarentena", note: "conferindo a origem" })).ok).toBe(true)
    expect(await stockOf(variantId)).toBe(0)
    expect(await buy(variantId)).toMatchObject({ ok: false, error: "Item esgotado." })
    expect(await rows(`SELECT 1 FROM "delivery_stock_item"`)).toHaveLength(2)

    holder.userId = "mod"
    expect((await reviewStockBatch({ batchId, decision: "aprovado" })).ok).toBe(true)
    expect(await stockOf(variantId)).toBe(2)
    expect((await runWalletReconciliation()).findings).toEqual([])
  })

  it("lote com itens repetidos guarda só os que entraram, e um envio todo repetido não deixa lote vazio", async () => {
    await approve("ana", "gift-cards", true)
    const { variantId } = await listing()
    await sendStock(variantId, ["CODE-AAAA-1111"])
    const again = await sendStock(variantId, ["CODE-AAAA-1111", "CODE-BBBB-2222"])
    expect(again.ok).toBe(true)
    expect((await rows(`SELECT "itemCount" FROM "stock_batch" ORDER BY "id"`)).map((r) => (r as { itemCount: number }).itemCount)).toEqual([1, 1])

    const nothing = await sendStock(variantId, ["CODE-AAAA-1111"])
    expect(nothing.ok).toBe(true)
    expect(await rows(`SELECT 1 FROM "stock_batch"`)).toHaveLength(2)
  })

  it("a fila da moderação mostra só a máscara, nunca o conteúdo do código", async () => {
    await approve("ana", "gift-cards", true)
    const { variantId } = await listing()
    await sendStock(variantId, ["SECRETCODE-9999-ZZ"])
    const queue = await listStockBatches()
    expect(queue.pending).toHaveLength(1)
    expect(JSON.stringify(queue)).not.toContain("SECRETCODE")
    expect(queue.pending[0].masks[0]).toMatch(/^SE••••ZZ$/)
    expect(queue.pending[0]).toMatchObject({ sellerName: "ana", itemCount: 1, unsold: 1 })
  })

  it("a conferência acusa estoque desalinhado com os lotes e item vendido de lote recusado", async () => {
    await approve("ana", "gift-cards", false)
    const { variantId } = await listing()
    await sendStock(variantId, ["CODE-AAAA-1111", "CODE-BBBB-2222"])
    // alguém mexe no estoque à mão e o número do anúncio deixa de bater com os itens à venda
    await t.query(`UPDATE "product_variant" SET "stock" = 5 WHERE "id" = $1`, [variantId])
    expect((await runWalletReconciliation()).findings.map((f) => f.check)).toContain("estoque_automatico_divergente")
    await t.query(`UPDATE "product_variant" SET "stock" = 2 WHERE "id" = $1`, [variantId])

    // item vendido DEPOIS de o lote ser recusado (por um defeito qualquer) precisa aparecer
    const batchId = (await one<{ id: number }>(`SELECT "id" FROM "stock_batch"`)).id
    await t.query(`UPDATE "stock_batch" SET "status" = 'recusado', "reviewedAt" = now() - interval '1 hour' WHERE "id" = $1`, [batchId])
    const order = await buy(variantId)
    expect(order).toMatchObject({ ok: false })
    await t.query(`UPDATE "stock_batch" SET "status" = 'aprovado' WHERE "id" = $1`, [batchId])
    const sold = await buy(variantId)
    expect(sold.ok).toBe(true)
    await t.query(`UPDATE "stock_batch" SET "status" = 'recusado', "reviewedAt" = now() - interval '1 hour' WHERE "id" = $1`, [batchId])
    expect((await runWalletReconciliation()).findings.map((f) => f.check)).toContain("estoque_vendido_de_lote_recusado")
  })
})

describe("dados do comprador na compra", () => {
  it("recarga exige o ID do jogador, limpa o texto, guarda no pedido e registra no chat", async () => {
    await approve("ana", "recargas")
    const { variantId } = await listing({ category: "recargas", deliveryType: "manual", stock: 3 })

    expect(await buy(variantId)).toMatchObject({ ok: false, error: "Informe: ID ou apelido no jogo." })
    expect(await buy(variantId, "buyer", { playerId: "   " })).toMatchObject({ ok: false })
    expect((await wallet("buyer")).availableCents).toBe(100_000)
    expect(await stockOf(variantId)).toBe(3)

    const r = await buy(variantId, "buyer", { playerId: "  Fulano#1234\n\n ", server: "Brasil", extra: "ignorado" } as Record<string, string>)
    expect(r.ok, r.error).toBe(true)
    const saved = await one<{ info: Record<string, string> }>(`SELECT "info" FROM "order_buyer_info" WHERE "orderId" = $1`, [r.orderId])
    expect(saved.info).toEqual({ playerId: "Fulano#1234", server: "Brasil" })
    const msg = await one<{ body: string }>(`SELECT "body" FROM "order_message" WHERE "orderId" = $1 AND "authorRole" = 'system'`, [r.orderId])
    expect(msg.body).toContain("ID ou apelido no jogo: Fulano#1234")
    expect(await getOrderBuyerInfo(r.orderId!, "recargas")).toEqual([
      { label: "ID ou apelido no jogo", value: "Fulano#1234" },
      { label: "Servidor ou região", value: "Brasil" },
    ])
  })

  it("corta o tamanho dos campos e ignora o que não é texto", async () => {
    await approve("ana", "recargas")
    const { variantId } = await listing({ category: "recargas", deliveryType: "manual", stock: 1 })
    const r = await buy(variantId, "buyer", { playerId: "a".repeat(500), server: 7 as unknown as string })
    expect(r.ok, r.error).toBe(true)
    const saved = await one<{ info: Record<string, string> }>(`SELECT "info" FROM "order_buyer_info"`)
    expect(saved.info.playerId).toHaveLength(80)
    expect(saved.info.server).toBeUndefined()
  })

  it("categoria sem dados do comprador (contas) não grava nada, mesmo que o navegador mande", async () => {
    const { variantId } = await listing({ category: "contas", deliveryType: "manual", stock: 1 })
    const r = await buy(variantId, "buyer", { playerId: "qualquer" })
    expect(r.ok, r.error).toBe(true)
    expect(await rows(`SELECT 1 FROM "order_buyer_info"`)).toHaveLength(0)
  })

  it("moedas pedem o apelido, boosting deixa opcional", async () => {
    const moeda = await listing({ category: "moedas", deliveryType: "manual", stock: 1 })
    expect(await buy(moeda.variantId)).toMatchObject({ ok: false })
    expect((await buy(moeda.variantId, "buyer", { playerId: "Jogador1" })).ok).toBe(true)
    const boost = await listing({ category: "boosting", deliveryType: "manual", stock: 1 })
    expect((await buy(boost.variantId)).ok).toBe(true)
  })

  it("o campo vem do pedido do comprador, nunca de outro pedido (cada pedido guarda o seu)", async () => {
    await approve("ana", "recargas")
    const { variantId } = await listing({ category: "recargas", deliveryType: "manual", stock: 2 })
    const a = await buy(variantId, "buyer", { playerId: "Um" })
    const b = await buy(variantId, "buyer2", { playerId: "Dois" })
    expect((await getOrderBuyerInfo(a.orderId!, "recargas"))[0].value).toBe("Um")
    expect((await getOrderBuyerInfo(b.orderId!, "recargas"))[0].value).toBe("Dois")
  })
})

describe("antes da migração 0015 (tabelas novas ausentes)", () => {
  // Roda por último: apaga as tabelas novas, como o banco de produção antes de `pnpm db:migrate`.
  it("gift cards seguem abertos, as categorias novas ficam fechadas, a compra e o estoque funcionam como antes", async () => {
    await t.query(`DROP TABLE "order_buyer_info", "seller_category_approval"`)
    await t.query(`ALTER TABLE "delivery_stock_item" DROP COLUMN "batchId"`)
    await t.query(`DROP TABLE "stock_batch"`)

    expect(await sellerMayList("ana", "gift-cards")).toBe(true)
    expect(await sellerMayList("ana", "assinaturas")).toBe(false)
    expect(await sellerMayList("ana", "recargas")).toBe(false)
    expect(await sellerMayList("ana", "itens")).toBe(true)
    expect(await sellableCategorySlugs("ana")).toContain("gift-cards")
    expect(await sellableCategorySlugs("ana")).not.toContain("keys")
    expect((await listApprovalQueue()).available).toBe(false)
    expect((await listStockBatches()).available).toBe(false)

    holder.userId = "ana"
    expect(await createProduct(newListing())).toMatchObject({ ok: false, field: "categorySlug" })
    expect((await createProduct(newListing({ categorySlug: "gift-cards", game: "Steam", attributes: { regiao: "br" }, title: "Gift card Steam R$ 50" }))).ok).toBe(true)

    // estoque e compra do gift card automático sem lotes (a lógica de antes)
    const { variantId } = await listing({ category: "gift-cards" })
    const added = await sendStock(variantId, ["CODE-AAAA-1111"])
    expect(added.ok, added.error).toBe(true)
    expect(await stockOf(variantId)).toBe(1)
    expect((await buy(variantId)).ok).toBe(true)

    // recarga: sem a tabela de dados do comprador a compra segue sem pedir nada
    const moeda = await listing({ category: "moedas", deliveryType: "manual", stock: 1 })
    expect((await buy(moeda.variantId)).ok).toBe(true)
    expect(await getOrderBuyerInfo(1, "recargas")).toEqual([])
    expect((await runWalletReconciliation()).findings).toEqual([])
  })
})
