import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { MAX_BULK_CHANGES } from "@/lib/bulk-edit"

/**
 * Edição de preço e estoque em lote contra um Postgres em memória com as migrações reais: só itens do próprio vendedor,
 * tudo validado antes de gravar (uma mudança ruim recusa o lote), estoque da entrega automática travado.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
  revalidated: [] as string[],
  priced: [] as number[],
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
vi.mock("@/lib/notify", () => ({
  notifyPriceChange: (productId: number) => {
    holder.priced.push(productId)
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: (path: string) => holder.revalidated.push(path) }))

import { bulkUpdateVariants } from "@/app/actions/products-bulk"
import { getBulkRowsPage } from "@/lib/seller-bulk"

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
  holder.userId = null
  holder.revalidated.length = 0
  holder.priced.length = 0
  await t.query(`TRUNCATE "auth_attempt", "product_variant", "product", "seller_application", "profile", "user" RESTART IDENTITY CASCADE`)
  for (const [id, verified] of [["ana", true], ["bia", true], ["sem-email", false]] as const) {
    await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES ($1, $1, $1 || '@teste.dev', $2)`, [id, verified])
    await t.query(`INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "birthDate") VALUES ($1, $1, '52998224725', '11999999999', '1990-01-01')`, [id])
    await t.query(`INSERT INTO "seller_application" ("userId", "status", "storeSlug") VALUES ($1, 'aprovado', $1 || '-store')`, [id])
  }
})

async function item(seller: string, slug: string, label: string, price = 10_000, stock = 5, opts: { deliveryType?: string; active?: boolean } = {}) {
  const p = (await t.query(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "deliveryType") VALUES ($1, $2, $2, 'contas', $3) RETURNING "id"`,
    [seller, slug, opts.deliveryType ?? "manual"],
  )).rows[0].id as number
  const v = await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock", "active") VALUES ($1, $2, $3, $4, $5) RETURNING "id"`, [p, label, price, stock, opts.active ?? true])
  return v.rows[0].id as number
}

const variant = async (id: number) => (await t.query(`SELECT "priceCents", "stock" FROM "product_variant" WHERE "id" = $1`, [id])).rows[0] as { priceCents: number; stock: number }

describe("bulkUpdateVariants", () => {
  it("atualiza preço e estoque dos itens do vendedor, e só o campo que veio", async () => {
    const a = await item("ana", "a1", "Imortal", 10_000, 5)
    const b = await item("ana", "a2", "Radiante", 20_000, 7)
    holder.userId = "ana"
    const r = await bulkUpdateVariants([{ variantId: a, price: "89,90" }, { variantId: b, stock: "0" }])
    expect(r).toMatchObject({ ok: true, updated: 2, message: "2 itens atualizados." })
    expect(await variant(a)).toEqual({ priceCents: 8_990, stock: 5 }) // estoque intacto
    expect(await variant(b)).toEqual({ priceCents: 20_000, stock: 0 }) // preço intacto
    expect(holder.revalidated).toEqual(expect.arrayContaining(["/painel/vendedor/produtos", "/produtos/a1", "/produtos/a2"]))
  })

  it("item de outro vendedor recusa o lote inteiro e nada muda", async () => {
    const mine = await item("ana", "a1", "Meu", 10_000, 5)
    const theirs = await item("bia", "b1", "Dela", 10_000, 5)
    holder.userId = "ana"
    const r = await bulkUpdateVariants([{ variantId: mine, price: "1,00" }, { variantId: theirs, price: "1,00" }])
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("não foi encontrado") })
    expect((await variant(mine)).priceCents).toBe(10_000)
    expect((await variant(theirs)).priceCents).toBe(10_000)
  })

  it("uma mudança inválida no meio recusa tudo, dizendo qual item", async () => {
    const a = await item("ana", "a1", "Imortal", 10_000, 5)
    const b = await item("ana", "a2", "Radiante", 20_000, 7)
    holder.userId = "ana"
    const r = await bulkUpdateVariants([{ variantId: a, price: "50,00" }, { variantId: b, price: "0,50" }])
    expect(r).toMatchObject({ ok: false, error: "Radiante: O preço mínimo é R$ 1,00." })
    expect((await variant(a)).priceCents).toBe(10_000) // a primeira não foi gravada
  })

  it("estoque de anúncio de entrega automática não se edita aqui, mas o preço sim", async () => {
    const auto = await item("ana", "auto", "Gift 50", 5_000, 3, { deliveryType: "automatica" })
    holder.userId = "ana"
    expect(await bulkUpdateVariants([{ variantId: auto, stock: "99" }])).toMatchObject({ ok: false, error: expect.stringContaining("número de itens cadastrados") })
    expect((await variant(auto)).stock).toBe(3)
    expect(await bulkUpdateVariants([{ variantId: auto, price: "55,00" }])).toMatchObject({ ok: true })
    expect(await variant(auto)).toEqual({ priceCents: 5_500, stock: 3 })
  })

  it("item desativado não entra", async () => {
    const off = await item("ana", "a1", "Antigo", 10_000, 5, { active: false })
    holder.userId = "ana"
    expect(await bulkUpdateVariants([{ variantId: off, price: "20,00" }])).toMatchObject({ ok: false })
    expect((await variant(off)).priceCents).toBe(10_000)
  })

  it("lote vazio, grande demais, com id repetido ou inválido é recusado", async () => {
    const a = await item("ana", "a1", "Imortal")
    holder.userId = "ana"
    expect(await bulkUpdateVariants([])).toMatchObject({ ok: false })
    const many = Array.from({ length: MAX_BULK_CHANGES + 1 }, (_, i) => ({ variantId: i + 1, price: "10,00" }))
    expect(await bulkUpdateVariants(many)).toMatchObject({ ok: false, error: expect.stringContaining(String(MAX_BULK_CHANGES)) })
    expect(await bulkUpdateVariants([{ variantId: a, price: "10,00" }, { variantId: a, price: "11,00" }])).toMatchObject({ ok: false, error: "Pedido inválido." })
    expect(await bulkUpdateVariants([{ variantId: 0, price: "10,00" }])).toMatchObject({ ok: false, error: "Pedido inválido." })
    expect(await bulkUpdateVariants([{ variantId: 1.5, price: "10,00" }])).toMatchObject({ ok: false, error: "Pedido inválido." })
  })

  it("exige login e e-mail confirmado", async () => {
    const a = await item("sem-email", "se1", "Item")
    holder.userId = null
    await expect(bulkUpdateVariants([{ variantId: a, price: "20,00" }])).rejects.toThrow("Não autenticado")
    holder.userId = "sem-email"
    expect(await bulkUpdateVariants([{ variantId: a, price: "20,00" }])).toMatchObject({ ok: false, field: "email" })
    expect((await variant(a)).priceCents).toBe(10_000)
  })

  it("limite de 30 lotes por hora", async () => {
    const a = await item("ana", "a1", "Imortal")
    holder.userId = "ana"
    for (let i = 0; i < 30; i++) await bulkUpdateVariants([{ variantId: a, price: `${10 + i},00` }])
    expect(await bulkUpdateVariants([{ variantId: a, price: "99,00" }])).toMatchObject({ ok: false, error: expect.stringContaining("Muitas edições") })
  })
})

describe("aviso de queda de preço (favoritos)", () => {
  it("pede o aviso dos anúncios cujo preço mudou de verdade, uma vez por anúncio", async () => {
    const a1 = await item("ana", "a1", "Imortal", 10_000, 5)
    const a2 = await item("ana", "a2", "Radiante", 20_000, 5)
    const a3 = await item("ana", "a3", "Ouro", 5_000, 5)
    holder.userId = "ana"
    await bulkUpdateVariants([
      { variantId: a1, price: "80,00" }, // mudou
      { variantId: a2, price: "200,00" }, // mesmo preço: não conta
      { variantId: a3, stock: "9" }, // só estoque: não conta
    ])
    const productOf = async (variantId: number) => (await t.query(`SELECT "productId" FROM "product_variant" WHERE "id" = $1`, [variantId])).rows[0].productId as number
    expect(holder.priced).toEqual([await productOf(a1)])
  })

  it("lote recusado não pede aviso nenhum", async () => {
    const a1 = await item("ana", "a1", "Imortal", 10_000, 5)
    holder.userId = "ana"
    await bulkUpdateVariants([{ variantId: a1, price: "0,50" }])
    expect(holder.priced).toEqual([])
  })
})

describe("getBulkRowsPage", () => {
  it("lista só os itens ativos do vendedor, com busca por título e paginação de 50", async () => {
    await item("ana", "conta-valorant", "Imortal")
    await item("ana", "gift-steam", "R$ 50")
    await item("ana", "velho", "Desativado", 100, 1, { active: false })
    await item("bia", "da-bia", "Dela")
    const all = await getBulkRowsPage("ana", { page: 1 })
    expect(all.rows.map((r) => r.label).sort()).toEqual(["Imortal", "R$ 50"])
    expect(all.total).toBe(2)
    const q = await getBulkRowsPage("ana", { q: "STEAM", page: 1 })
    expect(q.rows.map((r) => r.label)).toEqual(["R$ 50"])

    for (let i = 0; i < 52; i++) await item("bia", `lote-${i}`, `Item ${i}`)
    const p1 = await getBulkRowsPage("bia", { page: 1 })
    const p2 = await getBulkRowsPage("bia", { page: 2 })
    expect([p1.total, p1.pages, p1.rows.length, p2.rows.length]).toEqual([53, 2, 50, 3])
  })
})
