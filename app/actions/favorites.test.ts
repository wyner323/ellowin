import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Favoritos contra um Postgres em memória com as migrações reais: guardar e tirar, a base de preço para o aviso de queda,
 * limites, privacidade (cada pessoa só mexe nos seus), a lista, a limpeza ao excluir a conta e a migração pendente.
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

import { toggleFavorite } from "@/app/actions/favorites"
import { anonymizeAccount } from "@/lib/account-deletion"
import { MAX_FAVORITES, getFavoriteState, getFavorites, minSellingPrice } from "@/lib/favorites"

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
  holder.userId = "bia"
  holder.revalidated.length = 0
  await t.query(`TRUNCATE "auth_attempt", "favorite", "product_image", "product_variant", "product", "seller_application", "user" RESTART IDENTITY CASCADE`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('ana', 'Ana Maria da Silva', 'ana@t.dev', 'AnaGames'), ('bia', 'Bia', 'bia@t.dev', 'Bia'), ('cadu', 'Cadu', 'cadu@t.dev', 'Cadu')`)
  await t.query(`INSERT INTO "seller_application" ("userId", "storeName", "status") VALUES ('ana', 'Loja da Ana', 'aprovado')`)
})

async function listing(slug: string, opts: { seller?: string; status?: string; variants?: [number, number][]; title?: string } = {}) {
  const id = (await t.query(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game", "status") VALUES ($1, $2, $3, 'contas', 'Valorant', $4) RETURNING "id"`,
    [opts.seller ?? "ana", slug, opts.title ?? `Conta ${slug}`, opts.status ?? "ativo"],
  )).rows[0].id as number
  for (const [price, stock] of opts.variants ?? [[10_000, 3]]) {
    await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'v', $2, $3)`, [id, price, stock])
  }
  return id
}

const favRows = async () => (await t.query(`SELECT "userId", "productId", "baselineCents" FROM "favorite" ORDER BY "userId", "productId"`)).rows as { userId: string; productId: number; baselineCents: number | null }[]

describe("minSellingPrice", () => {
  it("menor preço entre itens ativos COM estoque de anúncio ativo; nulo se nada está à venda", async () => {
    const p = await listing("a", { variants: [[5_000, 0], [8_000, 2], [6_000, 1]] })
    expect(await minSellingPrice(p)).toBe(6_000) // o de 5.000 está sem estoque
    await t.query(`UPDATE "product_variant" SET "active" = false WHERE "productId" = $1 AND "priceCents" = 6000`, [p])
    expect(await minSellingPrice(p)).toBe(8_000)
    await t.query(`UPDATE "product" SET "status" = 'pausado' WHERE "id" = $1`, [p])
    expect(await minSellingPrice(p)).toBeNull()
    expect(await minSellingPrice(999)).toBeNull()
  })
})

describe("toggleFavorite", () => {
  it("guarda com a base no menor preço à venda de agora, e uma segunda chamada tira", async () => {
    const p = await listing("a", { variants: [[9_000, 1], [7_000, 4]] })
    const on = await toggleFavorite(p)
    expect(on).toMatchObject({ ok: true, favorite: true })
    expect(await favRows()).toEqual([{ userId: "bia", productId: p, baselineCents: 7_000 }])
    expect(holder.revalidated).toContain("/favoritos")

    const off = await toggleFavorite(p)
    expect(off).toMatchObject({ ok: true, favorite: false })
    expect(await favRows()).toEqual([])
  })

  it("anúncio sem nada à venda guarda com base nula", async () => {
    const p = await listing("a", { variants: [[9_000, 0]] })
    await toggleFavorite(p)
    expect((await favRows())[0].baselineCents).toBeNull()
  })

  it("cada pessoa mexe só nos seus: o favorito de uma não aparece nem sai pela outra", async () => {
    const p = await listing("a")
    await toggleFavorite(p)
    holder.userId = "cadu"
    await toggleFavorite(p)
    expect((await favRows()).map((r) => r.userId)).toEqual(["bia", "cadu"])
    await toggleFavorite(p) // cadu tira o dele
    expect((await favRows()).map((r) => r.userId)).toEqual(["bia"])
  })

  it("não favorita o próprio anúncio, anúncio inexistente, de conta excluída ou id inválido", async () => {
    const p = await listing("a")
    holder.userId = "ana"
    expect(await toggleFavorite(p)).toMatchObject({ ok: false, error: expect.stringContaining("próprio anúncio") })
    holder.userId = "bia"
    expect(await toggleFavorite(999)).toMatchObject({ ok: false, error: "Anúncio não encontrado." })
    expect(await toggleFavorite(0)).toMatchObject({ ok: false })
    expect(await toggleFavorite(1.5)).toMatchObject({ ok: false })
    await t.query(`UPDATE "user" SET "deletedAt" = now() WHERE "id" = 'ana'`)
    expect(await toggleFavorite(p)).toMatchObject({ ok: false, error: "Anúncio não encontrado." })
    expect(await favRows()).toEqual([])
  })

  it("exige estar logado", async () => {
    const p = await listing("a")
    holder.userId = null
    await expect(toggleFavorite(p)).rejects.toThrow("Não autenticado")
  })

  it("teto de 200 anúncios guardados (tirar libera espaço)", async () => {
    await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") SELECT 'ana', 'lote-' || g, 'Lote ' || g, 'contas' FROM generate_series(1, ${MAX_FAVORITES}) g`)
    await t.query(`INSERT INTO "favorite" ("userId", "productId") SELECT 'bia', "id" FROM "product"`)
    const extra = await listing("extra")
    expect(await toggleFavorite(extra)).toMatchObject({ ok: false, error: expect.stringContaining("até 200") })
    const first = (await favRows())[0].productId
    expect(await toggleFavorite(first)).toMatchObject({ ok: true, favorite: false })
    expect(await toggleFavorite(extra)).toMatchObject({ ok: true, favorite: true })
  })

  it("limite de 60 alterações por hora", async () => {
    const p = await listing("a")
    for (let i = 0; i < 60; i++) await toggleFavorite(p)
    expect(await toggleFavorite(p)).toMatchObject({ ok: false, error: expect.stringContaining("Muitas alterações") })
  })
})

describe("leituras", () => {
  it("getFavoriteState diz se o anúncio está guardado por ESTA pessoa", async () => {
    const p = await listing("a")
    await toggleFavorite(p)
    expect(await getFavoriteState("bia", p)).toEqual({ available: true, favorite: true })
    expect(await getFavoriteState("cadu", p)).toEqual({ available: true, favorite: false })
  })

  it("getFavorites: mais novos primeiro, preço de agora, 'à venda' só com anúncio ativo e estoque, loja pelo nome público", async () => {
    const a = await listing("a", { title: "Conta A", variants: [[9_000, 1], [7_000, 2]] })
    const b = await listing("b", { title: "Conta B", variants: [[5_000, 0]] }) // sem estoque
    const c = await listing("c", { title: "Conta C" })
    await t.query(`INSERT INTO "favorite" ("userId", "productId", "createdAt") VALUES ('bia', $1, now() - interval '3 days'), ('bia', $2, now() - interval '2 days'), ('bia', $3, now() - interval '1 day')`, [a, b, c])
    await t.query(`UPDATE "product" SET "status" = 'pausado' WHERE "id" = $1`, [c])
    await t.query(`INSERT INTO "product_image" ("productId", "url", "sortOrder") VALUES ($1, 'https://blob/capa.webp', 0)`, [a])

    const { available, items } = await getFavorites("bia")
    expect(available).toBe(true)
    expect(items.map((i) => [i.title, i.priceCents, i.forSale])).toEqual([["Conta C", null, false], ["Conta B", null, false], ["Conta A", 7_000, true]])
    expect(items.find((i) => i.title === "Conta A")).toMatchObject({ coverUrl: "https://blob/capa.webp", seller: "Loja da Ana", game: "Valorant" })
    expect(JSON.stringify(items)).not.toContain("Ana Maria da Silva")
    expect((await getFavorites("cadu")).items).toEqual([])
  })

  it("anúncio de vendedor com conta excluída não aparece na lista", async () => {
    const p = await listing("a")
    await toggleFavorite(p)
    await t.query(`UPDATE "user" SET "deletedAt" = now() WHERE "id" = 'ana'`)
    expect((await getFavorites("bia")).items).toEqual([])
  })
})

describe("exclusão de conta (LGPD) e migração pendente", () => {
  it("anonimizar a conta apaga os favoritos dela e só os dela", async () => {
    const p = await listing("a")
    await toggleFavorite(p)
    holder.userId = "cadu"
    await toggleFavorite(p)
    await anonymizeAccount("bia")
    expect((await favRows()).map((r) => r.userId)).toEqual(["cadu"])
  })

  // Por último: apaga a tabela. Cada teste acima começa com TRUNCATE dela, então este fica no fim do arquivo.
  it("sem a tabela (migração 0013 pendente) a lista e o estado dizem 'indisponível' e a ação avisa, sem derrubar nada", async () => {
    const p = await listing("a")
    await t.query(`DROP TABLE "favorite" CASCADE`)
    expect(await getFavoriteState("bia", p)).toEqual({ available: false, favorite: false })
    expect(await getFavorites("bia")).toEqual({ available: false, items: [] })
    expect(await toggleFavorite(p)).toMatchObject({ ok: false, error: expect.stringContaining("ainda não estão disponíveis") })
    await expect(anonymizeAccount("bia")).resolves.toBeUndefined()
  })
})
