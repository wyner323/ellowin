import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

const holder = vi.hoisted(() => ({ pool: null as unknown as TestDb["pool"] }))
vi.mock("@/lib/db", () => ({ pool: { query: (text: string, params?: unknown[]) => holder.pool.query(text, params) } }))

import { getLowStock, LOW_STOCK_THRESHOLD } from "@/lib/seller-alerts"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

beforeEach(async () => {
  await t.query(`TRUNCATE "product_variant", "product", "user" RESTART IDENTITY CASCADE`)
  for (const id of ["s", "outro"]) await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $1 || '@t.dev')`, [id])
})

async function listing(seller: string, title: string, status: string, variants: { label: string; stock: number; active?: boolean }[]) {
  const id = (await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "status") VALUES ($1, $2, $3, 'contas', $4) RETURNING "id"`, [seller, title.toLowerCase().replace(/\W+/g, "-"), title, status])).rows[0].id as number
  for (const v of variants) await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock", "active") VALUES ($1, $2, 1000, $3, $4)`, [id, v.label, v.stock, v.active ?? true])
  return id
}

describe("getLowStock", () => {
  it("variações ativas de anúncios ativos com até 2 unidades, das sem estoque para as com mais", async () => {
    expect(LOW_STOCK_THRESHOLD).toBe(2)
    await listing("s", "Conta A", "ativo", [{ label: "Imortal", stock: 2 }, { label: "Radiante", stock: 0 }, { label: "Ouro", stock: 9 }])
    await listing("s", "Conta B", "ativo", [{ label: "Prata", stock: 1 }])
    const items = await getLowStock("s")
    expect(items.map((i) => [i.title, i.label, i.stock])).toEqual([
      ["Conta A", "Radiante", 0],
      ["Conta B", "Prata", 1],
      ["Conta A", "Imortal", 2],
    ])
  })

  it("não avisa de anúncio pausado, variação pausada nem de estoque de outro vendedor", async () => {
    await listing("s", "Pausado", "pausado", [{ label: "x", stock: 0 }])
    await listing("s", "Variação pausada", "ativo", [{ label: "y", stock: 0, active: false }])
    await listing("outro", "Do outro", "ativo", [{ label: "z", stock: 0 }])
    expect(await getLowStock("s")).toEqual([])
  })

  it("respeita o limite", async () => {
    await listing("s", "Muitos", "ativo", Array.from({ length: 6 }, (_, i) => ({ label: `v${i}`, stock: 0 })))
    expect(await getLowStock("s", 4)).toHaveLength(4)
  })
})
