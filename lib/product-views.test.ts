import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

const holder = vi.hoisted(() => ({ pool: null as unknown as TestDb["pool"], captured: [] as unknown[] }))
vi.mock("@/lib/db", () => ({ pool: { query: (text: string, params?: unknown[]) => holder.pool.query(text, params) } }))
vi.mock("@sentry/nextjs", () => ({ captureException: (e: unknown) => holder.captured.push(e) }))

import { countsAsView, isLikelyBot, recordProductView } from "@/lib/product-views"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

beforeEach(async () => {
  holder.captured = []
  await t.query(`TRUNCATE "product_view_daily", "product", "user" RESTART IDENTITY CASCADE`)
  await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ('v', 'V', 'v@t.dev')`)
  await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('v', 'a', 'A', 'contas'), ('v', 'b', 'B', 'contas')`)
})

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

describe("isLikelyBot / countsAsView", () => {
  it("robôs, pré-visualizações e ferramentas não contam; navegador comum conta", () => {
    for (const ua of ["Googlebot/2.1", "Mozilla/5.0 (compatible; bingbot/2.0)", "facebookexternalhit/1.1", "curl/8.4.0", "python-requests/2.31", "HeadlessChrome/120", "", null, undefined, "x"])
      expect(isLikelyBot(ua), String(ua)).toBe(true)
    expect(isLikelyBot(CHROME)).toBe(false)
  })

  it("só conta anúncio ativo visto por quem não é o dono", () => {
    const base = { productStatus: "ativo", sellerId: "v", viewerId: null as string | null, userAgent: CHROME }
    expect(countsAsView(base)).toBe(true)
    expect(countsAsView({ ...base, viewerId: "outro" })).toBe(true)
    expect(countsAsView({ ...base, viewerId: "v" })).toBe(false)
    expect(countsAsView({ ...base, productStatus: "pausado" })).toBe(false)
    expect(countsAsView({ ...base, userAgent: "Googlebot/2.1" })).toBe(false)
  })
})

describe("recordProductView", () => {
  it("soma 1 por visita no dia de hoje e mantém um contador por anúncio", async () => {
    await recordProductView(1)
    await recordProductView(1)
    await recordProductView(2)
    const { rows } = await t.query(`SELECT "productId", "views", "day"::text AS "day" FROM "product_view_daily" ORDER BY "productId"`)
    expect(rows.map((r) => [r.productId, r.views])).toEqual([[1, 2], [2, 1]])
    // dia de Brasília: confere com o relógio do banco
    const { rows: today } = await t.query(`SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS d`)
    expect(rows[0].day).toBe(today[0].d)
  })

  it("visitas ao mesmo tempo não se perdem", async () => {
    await Promise.all(Array.from({ length: 12 }, () => recordProductView(1)))
    const { rows } = await t.query(`SELECT "views" FROM "product_view_daily" WHERE "productId" = 1`)
    expect(rows[0].views).toBe(12)
  })

  it("nunca lança: anúncio que não existe vira erro registrado, não falha da página", async () => {
    await expect(recordProductView(999)).resolves.toBeUndefined()
    expect(holder.captured).toHaveLength(1)
    expect((await t.query(`SELECT count(*)::int AS n FROM "product_view_daily"`)).rows[0].n).toBe(0)
  })
})
