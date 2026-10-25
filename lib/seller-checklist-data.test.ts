import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/** O que alimenta o checklist do vendedor novo, lido de um Postgres em memória com as migrações reais. */

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

import { getChecklistInputs } from "@/lib/seller-checklist-data"

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
  await t.query(`TRUNCATE "review_reply", "review", "product_question", "order", "product_image", "product_variant", "product", "seller_goal", "seller_application", "user" RESTART IDENTITY CASCADE`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified", "image", "bio") VALUES ('ana', 'Ana', 'ana@t.dev', true, 'https://blob/x.webp', 'Vendo contas há anos'), ('bia', 'Bia', 'bia@t.dev', false, NULL, NULL), ('cadu', 'Cadu', 'cadu@t.dev', true, NULL, NULL)`)
  await t.query(`INSERT INTO "seller_application" ("userId", "status") VALUES ('ana', 'aprovado'), ('bia', 'aprovado')`)
})

async function listing(seller: string, slug: string, opts: { images?: number; description?: string; status?: string; game?: string | null } = {}) {
  const id = (await t.query(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game", "description", "status") VALUES ($1, $2, $3, 'contas', $4, $5, $6) RETURNING "id"`,
    [seller, slug, "Conta de Valorant com bastante skin", opts.game === undefined ? "Roblox" : opts.game, opts.description ?? "x".repeat(300), opts.status ?? "ativo"],
  )).rows[0].id as number
  for (let i = 0; i < (opts.images ?? 0); i++) await t.query(`INSERT INTO "product_image" ("productId", "url", "sortOrder") VALUES ($1, $2, $3)`, [id, `https://blob/${slug}-${i}.webp`, i])
  return id
}

describe("getChecklistInputs", () => {
  it("perfil, e-mail e meta vêm do cadastro do vendedor", async () => {
    expect(await getChecklistInputs("ana")).toMatchObject({ emailVerified: true, profileComplete: true, goalAvailable: true, hasGoal: false })
    expect(await getChecklistInputs("bia")).toMatchObject({ emailVerified: false, profileComplete: false })
    // foto sem apresentação (ou o contrário) não completa o perfil
    expect((await getChecklistInputs("cadu")).profileComplete).toBe(false)
    await t.query(`UPDATE "user" SET "image" = 'https://blob/y.webp', "bio" = '   ' WHERE "id" = 'cadu'`)
    expect((await getChecklistInputs("cadu")).profileComplete).toBe(false)
    await t.query(`INSERT INTO "seller_goal" ("userId", "monthlyGoalCents") VALUES ('ana', 500000)`)
    expect((await getChecklistInputs("ana")).hasGoal).toBe(true)
  })

  it("conta só anúncios ATIVOS do vendedor: sem foto e abaixo da nota 80", async () => {
    await listing("ana", "completo", { images: 3 }) // 30+30+20+10+10 = 100
    await listing("ana", "sem-foto", { images: 0 }) // 70
    await listing("ana", "descricao-media", { images: 3, description: "y".repeat(60) }) // 30+10+20+10+10 = 80 (limite exato)
    await listing("ana", "pausado", { images: 0, status: "pausado" })
    await listing("bia", "da-bia", { images: 0 })
    const inputs = await getChecklistInputs("ana")
    expect(inputs.activeListings).toBe(3)
    expect(inputs.listingsWithoutPhoto).toBe(1)
    expect(inputs.listingsBelowGood).toBe(1) // só o sem foto (70); o de 80 já conta como completo
  })

  it("vendas concluídas, perguntas e avaliações pendentes", async () => {
    const p = await listing("ana", "a", { images: 1 })
    const v = (await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'v', 1000, 5) RETURNING "id"`, [p])).rows[0].id as number
    const order = async (status: string) =>
      (await t.query(
        `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "status") VALUES ('cadu', 'ana', $1, $2, 'x', 'y', 1000, $3) RETURNING "id"`,
        [p, v, status],
      )).rows[0].id as number
    await order("concluido")
    await order("entregue")
    const reviewed = await order("concluido")
    await t.query(`INSERT INTO "review" ("orderId", "productId", "sellerId", "buyerId", "rating") VALUES ($1, $2, 'ana', 'cadu', 5)`, [reviewed, p])
    await t.query(`INSERT INTO "product_question" ("productId", "askerId", "question") VALUES ($1, 'cadu', 'Tem skin rara?')`, [p])
    const inputs = await getChecklistInputs("ana")
    expect(inputs).toMatchObject({ completedSales: 2, pendingQuestions: 1, pendingReviews: 1 })
    expect(await getChecklistInputs("bia")).toMatchObject({ completedSales: 0, pendingQuestions: 0, pendingReviews: 0 })
  })

  it("sem as tabelas de migração recente (meta e respostas) o painel abre: meta indisponível e zero avaliações pendentes", async () => {
    await t.query(`DROP TABLE "seller_goal"`)
    await t.query(`DROP TABLE "review_reply" CASCADE`)
    const inputs = await getChecklistInputs("ana")
    expect(inputs.goalAvailable).toBe(false)
    expect(inputs.pendingReviews).toBe(0)
  })
})
