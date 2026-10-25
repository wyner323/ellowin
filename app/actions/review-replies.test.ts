import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { MAX_REPLY, MIN_REPLY } from "@/lib/review-reply-rules"

/**
 * Resposta do vendedor a uma avaliação, contra um Postgres em memória com as migrações reais: só o dono da avaliação
 * responde, a resposta é editável e apagável, tem limites de tamanho e de volume, aparece nas leituras públicas e,
 * sem a tabela (migração pendente), as telas continuam abrindo sem resposta.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
  revalidated: [] as string[],
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
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => holder.revalidated.push(path) }))

import { deleteReviewReply, replyToReview } from "@/app/actions/review-replies"
import { getOrderDetail } from "@/lib/orders"
import { getProductBySlug, getSellerRecentReviews } from "@/lib/marketplace"
import { countUnansweredReviews, getSellerReviewsPage } from "@/lib/review-replies"

let t: TestDb
let productId: number
let variantId: number

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

beforeEach(async () => {
  holder.userId = null
  holder.revalidated.length = 0
  await t.query(
    `TRUNCATE "auth_attempt", "review_reply", "review", "order", "product_variant", "product", "seller_application", "profile", "user" RESTART IDENTITY CASCADE`,
  )
  for (const [id, name] of [["ana", "AnaGames"], ["bia", "BiaStore"], ["cadu", "CaduPlay"], ["dani", "DaniPlay"]]) {
    await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName", "emailVerified") VALUES ($1, $1, $1 || '@teste.dev', $2, true)`, [id, name])
  }
  await t.query(`INSERT INTO "seller_application" ("userId", "storeName", "storeSlug", "level", "status") VALUES ('ana', 'Loja da Ana', 'loja-da-ana', 4, 'aprovado')`)
  const p = await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game") VALUES ('ana', 'conta-valorant', 'Conta Valorant', 'contas', 'Valorant') RETURNING "id"`)
  productId = p.rows[0].id as number
  variantId = (await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Imortal', 10000, 3) RETURNING "id"`, [productId])).rows[0].id as number
})

/** Pedido concluído do comprador `buyer` com avaliação; devolve o id da avaliação e do pedido. */
async function addReview(buyer: string, rating = 5, comment: string | null = "Tudo certo, recomendo") {
  const o = await t.query(
    `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "status")
     VALUES ($1, 'ana', $2, $3, 'Conta Valorant', 'Imortal', 10000, 'concluido') RETURNING "id"`,
    [buyer, productId, variantId],
  )
  const orderId = o.rows[0].id as number
  const r = await t.query(
    `INSERT INTO "review" ("orderId", "productId", "sellerId", "buyerId", "rating", "comment") VALUES ($1, $2, 'ana', $3, $4, $5) RETURNING "id"`,
    [orderId, productId, buyer, rating, comment],
  )
  return { reviewId: r.rows[0].id as number, orderId }
}

const replyRow = async (reviewId: number) => (await t.query(`SELECT * FROM "review_reply" WHERE "reviewId" = $1`, [reviewId])).rows[0] as { body: string; sellerId: string; createdAt: Date; updatedAt: Date } | undefined

describe("replyToReview", () => {
  it("o vendedor responde à avaliação recebida e a página do anúncio é revalidada", async () => {
    const { reviewId, orderId } = await addReview("cadu")
    holder.userId = "ana"
    const r = await replyToReview(reviewId, "  Obrigado pela compra!  ")
    expect(r).toMatchObject({ ok: true })
    expect((await replyRow(reviewId))?.body).toBe("Obrigado pela compra!")
    expect(holder.revalidated).toEqual(expect.arrayContaining(["/painel/vendedor/avaliacoes", "/produtos/conta-valorant", `/pedidos/${orderId}`]))
  })

  it("responder de novo edita a mesma resposta (uma por avaliação)", async () => {
    const { reviewId } = await addReview("cadu")
    holder.userId = "ana"
    await replyToReview(reviewId, "Primeira resposta")
    await replyToReview(reviewId, "Resposta corrigida")
    const rows = (await t.query(`SELECT "body" FROM "review_reply" WHERE "reviewId" = $1`, [reviewId])).rows
    expect(rows).toEqual([{ body: "Resposta corrigida" }])
  })

  it("só o dono da avaliação responde: outro vendedor, o comprador e quem não está logado são recusados", async () => {
    const { reviewId } = await addReview("cadu")
    for (const who of ["bia", "cadu"]) {
      holder.userId = who
      expect(await replyToReview(reviewId, "Tentando responder"), who).toMatchObject({ ok: false, error: "Avaliação não encontrada." })
    }
    expect(await replyRow(reviewId)).toBeUndefined()
    holder.userId = null
    await expect(replyToReview(reviewId, "Sem login")).rejects.toThrow("Não autenticado")
  })

  it("fronteiras do tamanho: mínimo 3 e máximo 500 caracteres (espaços nas pontas não contam)", async () => {
    const { reviewId } = await addReview("cadu")
    holder.userId = "ana"
    expect(await replyToReview(reviewId, " ab ")).toMatchObject({ ok: false, field: "body" })
    expect(await replyToReview(reviewId, "a".repeat(MIN_REPLY))).toMatchObject({ ok: true })
    expect(await replyToReview(reviewId, "a".repeat(MAX_REPLY))).toMatchObject({ ok: true })
    expect(await replyToReview(reviewId, "a".repeat(MAX_REPLY + 1))).toMatchObject({ ok: false, field: "body" })
    expect((await replyRow(reviewId))?.body).toHaveLength(MAX_REPLY)
  })

  it("id inválido e avaliação inexistente são recusados", async () => {
    holder.userId = "ana"
    expect(await replyToReview(0, "Resposta válida")).toMatchObject({ ok: false })
    expect(await replyToReview(1.5, "Resposta válida")).toMatchObject({ ok: false })
    expect(await replyToReview(999, "Resposta válida")).toMatchObject({ ok: false, error: "Avaliação não encontrada." })
  })

  it("limite de 30 respostas por hora", async () => {
    const { reviewId } = await addReview("cadu")
    holder.userId = "ana"
    for (let i = 0; i < 30; i++) await replyToReview(reviewId, `Resposta número ${i}`)
    expect(await replyToReview(reviewId, "Mais uma")).toMatchObject({ ok: false, error: expect.stringContaining("Muitas respostas") })
  })

  it("o texto é guardado como texto: nada de HTML interpretado", async () => {
    const { reviewId } = await addReview("cadu")
    holder.userId = "ana"
    await replyToReview(reviewId, `<script>alert(1)</script> obrigado`)
    expect((await replyRow(reviewId))?.body).toBe(`<script>alert(1)</script> obrigado`) // a tela escapa (React); o dado não é alterado
  })
})

describe("deleteReviewReply", () => {
  it("apaga a própria resposta; a de outro vendedor não sai", async () => {
    const { reviewId } = await addReview("cadu")
    holder.userId = "ana"
    await replyToReview(reviewId, "Obrigado pela compra!")
    holder.userId = "bia"
    expect(await deleteReviewReply(reviewId)).toMatchObject({ ok: false })
    expect(await replyRow(reviewId)).toBeDefined()
    holder.userId = "ana"
    expect(await deleteReviewReply(reviewId)).toMatchObject({ ok: true })
    expect(await replyRow(reviewId)).toBeUndefined()
  })
})

describe("leituras públicas e do painel", () => {
  it("a página do anúncio, a loja e o pedido trazem a resposta do vendedor", async () => {
    const { reviewId, orderId } = await addReview("cadu")
    await addReview("dani", 3, "Demorou um pouco")
    holder.userId = "ana"
    await replyToReview(reviewId, "Obrigado pela compra!")

    const detail = await getProductBySlug("conta-valorant")
    const byBuyer = Object.fromEntries(detail!.reviews.map((r) => [r.buyerName, r.reply?.body ?? null]))
    expect(byBuyer).toEqual({ CaduPlay: "Obrigado pela compra!", DaniPlay: null })

    const recent = await getSellerRecentReviews("ana")
    expect(recent.find((r) => r.id === reviewId)?.reply?.body).toBe("Obrigado pela compra!")

    const order = await getOrderDetail(orderId, "cadu", false)
    expect(order?.review?.reply?.body).toBe("Obrigado pela compra!")
  })

  it("a lista do painel traz só as avaliações do vendedor, filtra as sem resposta e conta os pendentes", async () => {
    const a = await addReview("cadu")
    await addReview("dani", 2, null)
    holder.userId = "ana"
    await replyToReview(a.reviewId, "Obrigado pela compra!")

    expect(await countUnansweredReviews("ana")).toBe(1)
    expect(await countUnansweredReviews("bia")).toBe(0)

    const all = await getSellerReviewsPage("ana", { filter: "todas", page: 1 })
    expect(all.counts).toEqual({ all: 2, unanswered: 1 })
    expect(all.rows.map((r) => [r.buyerName, r.reply?.body ?? null])).toEqual([["DaniPlay", null], ["CaduPlay", "Obrigado pela compra!"]])

    const pending = await getSellerReviewsPage("ana", { filter: "sem-resposta", page: 1 })
    expect(pending.rows.map((r) => r.buyerName)).toEqual(["DaniPlay"])
    expect(pending.filtered).toBe(1)

    expect((await getSellerReviewsPage("bia", { filter: "todas", page: 1 })).rows).toEqual([])
  })
})

describe("migração 0012 ainda não aplicada", () => {
  // Por último: apaga a tabela. Cada teste acima começa com TRUNCATE, que a lista; aqui é o fim do arquivo.
  it("a vitrine, o pedido e o painel abrem sem respostas e responder avisa que ainda não está disponível", async () => {
    const { reviewId, orderId } = await addReview("cadu")
    await t.query(`DROP TABLE "review_reply" CASCADE`)

    expect((await getProductBySlug("conta-valorant"))!.reviews[0].reply).toBeNull()
    expect((await getSellerRecentReviews("ana"))[0].reply).toBeNull()
    expect((await getOrderDetail(orderId, "cadu", false))?.review?.reply).toBeNull()
    expect(await countUnansweredReviews("ana")).toBe(0)

    const page = await getSellerReviewsPage("ana", { filter: "sem-resposta", page: 1 })
    expect(page.repliesAvailable).toBe(false)
    expect(page.rows).toHaveLength(1) // sem a tabela o filtro não existe: mostra todas

    holder.userId = "ana"
    expect(await replyToReview(reviewId, "Obrigado pela compra!")).toMatchObject({ ok: false, error: expect.stringContaining("ainda não estão disponíveis") })
    expect(await deleteReviewReply(reviewId)).toMatchObject({ ok: false })
  })
})
