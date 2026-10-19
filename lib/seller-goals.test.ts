import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

const holder = vi.hoisted(() => ({ pool: null as unknown as TestDb["pool"] }))
vi.mock("@/lib/db", () => ({ pool: { query: (text: string, params?: unknown[]) => holder.pool.query(text, params) } }))

import { getMonthProgressInputs, saveMonthlyGoal } from "@/lib/seller-goals"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

/** Meio-dia de Brasília, N dias atrás (negativo = no futuro), em UTC. */
const ago = (n: number) =>
  `((((now() AT TIME ZONE 'America/Sao_Paulo')::date - ${n}) + time '12:00') AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'`

let productId = 0

beforeEach(async () => {
  await t.query(`TRUNCATE "seller_goal", "order", "product_variant", "product", "user" RESTART IDENTITY CASCADE`)
  for (const id of ["s", "b", "outro"]) await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $1 || '@t.dev')`, [id])
  productId = (await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('s', 'a', 'A', 'contas') RETURNING "id"`)).rows[0].id as number
  await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'v', 1000, 5)`, [productId])
})

async function sale(net: number, completedDaysAgo: number, seller = "s", status = "concluido") {
  await t.query(
    `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents", "status", "createdAt", "completedAt")
     VALUES ('b', $1, $2, (SELECT "id" FROM "product_variant" WHERE "productId" = $2 LIMIT 1), 't', 'v', $3, 0, $3, $4, ${ago(completedDaysAgo)}, ${ago(completedDaysAgo)})`,
    [seller, productId, net, status],
  )
}

describe("getMonthProgressInputs", () => {
  it("receita do mês de Brasília só até hoje, do vendedor e só concluídas; dias do mês e dia de hoje do calendário", async () => {
    const { rows } = await t.query(`SELECT extract(day FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int AS d`)
    const today = rows[0].d as number
    await sale(1000, 0)
    await sale(500, today - 1) // dia 1 do mês (se hoje for dia 1, vira o próprio hoje: continua dentro)
    await sale(9999, today) // mês passado: fora
    await sale(7777, 0, "outro")
    await sale(8888, 0, "s", "cancelado")
    const p = await getMonthProgressInputs("s")
    expect(p.revenueCents).toBe(1500)
    expect(p.dayOfMonth).toBe(today)
    expect(p.daysInMonth).toBeGreaterThanOrEqual(28)
    expect(p.daysInMonth).toBeLessThanOrEqual(31)
    expect(p.month).toMatch(/^\d{4}-\d{2}$/)
    expect(p).toMatchObject({ available: true, goalCents: null })
  })

  it("grava, troca e apaga a meta; uma meta por vendedor", async () => {
    expect(await saveMonthlyGoal("s", 500_000)).toBe(true)
    expect((await getMonthProgressInputs("s")).goalCents).toBe(500_000)
    expect(await saveMonthlyGoal("s", 800_000)).toBe(true)
    expect((await getMonthProgressInputs("s")).goalCents).toBe(800_000)
    expect((await getMonthProgressInputs("outro")).goalCents).toBeNull()
    expect(await saveMonthlyGoal("s", null)).toBe(true)
    expect((await getMonthProgressInputs("s")).goalCents).toBeNull()
  })

  it("o banco recusa meta zero ou negativa", async () => {
    expect(await saveMonthlyGoal("s", 0)).toBe(false)
    expect(await saveMonthlyGoal("s", -5)).toBe(false)
  })

  it("sem a tabela (migração pendente): não quebra, avisa que não está disponível e não grava", async () => {
    await t.query(`ALTER TABLE "seller_goal" RENAME TO "seller_goal_off"`)
    try {
      await sale(300, 0)
      expect(await getMonthProgressInputs("s")).toMatchObject({ available: false, goalCents: null, revenueCents: 300 })
      expect(await saveMonthlyGoal("s", 100_000)).toBe(false)
    } finally {
      await t.query(`ALTER TABLE "seller_goal_off" RENAME TO "seller_goal"`)
    }
  })
})
