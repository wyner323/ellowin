import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { currentMonth, monthKeys } from "@/lib/statement-math"

/**
 * Extrato mensal de taxas: o SQL por mês de Brasília (virada à meia-noite local, não de UTC), só vendas concluídas,
 * só do vendedor, e o CSV de planilha com o total.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
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
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }) }))
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server")
  return { ...actual, after: () => {} }
})

import { GET } from "@/app/painel/vendedor/extrato/exportar/route"
import { getMonthlyStatement } from "@/lib/seller-statement"

let t: TestDb
let productId = 0

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

beforeEach(async () => {
  holder.userId = "ana"
  await t.query(`TRUNCATE "auth_attempt", "order", "product_variant", "product", "seller_application", "user" RESTART IDENTITY CASCADE`)
  for (const id of ["ana", "outra", "b1"]) await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $1 || '@t.dev')`, [id])
  await t.query(`INSERT INTO "seller_application" ("userId", "status") VALUES ('ana', 'aprovado'), ('outra', 'aprovado')`)
  productId = (await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('ana', 'a', 'Conta A', 'contas') RETURNING "id"`)).rows[0].id as number
  await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'v', 1000, 5)`, [productId])
})

/** Pedido do vendedor `seller` concluído em `completedAt` (UTC, como o banco guarda). */
async function sale(completedAt: string | null, o: { gross?: number; fee?: number; status?: string; seller?: string } = {}) {
  const gross = o.gross ?? 10_000
  const fee = o.fee ?? Math.round(gross * 0.08)
  await t.query(
    `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents", "status", "completedAt")
     VALUES ('b1', $1, $2, (SELECT "id" FROM "product_variant" WHERE "productId" = $2 LIMIT 1), 'x', 'y', $3, $4, $5, $6, $7)`,
    [o.seller ?? "ana", productId, gross, fee, gross - fee, o.status ?? "concluido", completedAt],
  )
}

const monthsAgo = (n: number, day = 15) => {
  const key = monthKeys(currentMonth(), n + 1)[n]
  return `${key}-${String(day).padStart(2, "0")} 15:00:00`
}

describe("getMonthlyStatement", () => {
  it("agrupa por mês, soma bruto, taxa e líquido e zera os meses sem venda", async () => {
    await sale(monthsAgo(0), { gross: 10_000 })
    await sale(monthsAgo(0, 20), { gross: 5_000 })
    await sale(monthsAgo(2), { gross: 20_000 })
    const months = await getMonthlyStatement("ana")
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ month: currentMonth(), sales: 2, grossCents: 15_000, feeCents: 1_200, netCents: 13_800 })
    expect(months[1].sales).toBe(0)
    expect(months[2]).toMatchObject({ sales: 1, grossCents: 20_000, feeCents: 1_600, netCents: 18_400 })
  })

  it("a virada do mês é à meia-noite de Brasília: 02:30 UTC do dia 1º ainda é o mês anterior", async () => {
    const cur = currentMonth()
    const prev = monthKeys(cur, 2)[1]
    await sale(`${cur}-01 02:30:00`) // 23:30 do último dia do mês anterior em Brasília
    await sale(`${cur}-01 03:00:00`) // 00:00 do dia 1º em Brasília
    const months = await getMonthlyStatement("ana")
    expect(months.find((m) => m.month === prev)?.sales).toBe(1)
    expect(months.find((m) => m.month === cur)?.sales).toBe(1)
  })

  it("só vendas concluídas do próprio vendedor entram (reembolsada, cancelada, em disputa, sem data e de outro não)", async () => {
    await sale(monthsAgo(0))
    await sale(monthsAgo(0), { status: "reembolsado" })
    await sale(monthsAgo(0), { status: "cancelado" })
    await sale(monthsAgo(0), { status: "em_disputa" })
    await sale(monthsAgo(0), { status: "entregue" })
    await sale(null)
    await sale(monthsAgo(0), { seller: "outra" })
    const months = await getMonthlyStatement("ana")
    expect(months[0].sales).toBe(1)
    expect((await getMonthlyStatement("outra"))[0].sales).toBe(1)
  })

  it("vendas mais antigas que a janela de 12 meses ficam de fora", async () => {
    await sale(monthsAgo(12))
    await sale(monthsAgo(11))
    const months = await getMonthlyStatement("ana")
    expect(months.reduce((n, m) => n + m.sales, 0)).toBe(1)
    expect(months.at(-1)?.sales).toBe(1)
  })
})

describe("GET /painel/vendedor/extrato/exportar", () => {
  it("exige login e vendedor aprovado", async () => {
    holder.userId = null
    expect((await GET()).status).toBe(401)
    holder.userId = "b1"
    expect((await GET()).status).toBe(403)
  })

  it("devolve CSV de planilha: BOM, ponto e vírgula, um mês por linha e a linha de total", async () => {
    await sale(monthsAgo(0), { gross: 10_000 })
    await sale(monthsAgo(1), { gross: 5_000 })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/csv")
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="extrato-ellowin-\d{4}-\d{2}-\d{2}\.csv"$/)
    // `Response.text()` descarta o BOM: confere pelos bytes (o Excel precisa dele para abrir os acentos).
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    const lines = new TextDecoder().decode(bytes.slice(3)).trim().split("\r\n")
    expect(lines[0]).toBe("Mês;Vendas concluídas;Valor pago pelos compradores (R$);Taxa Ellowin (R$);Taxa sobre o valor (%);Líquido recebido (R$)")
    expect(lines).toHaveLength(1 + 12 + 1)
    expect(lines[1]).toBe(`${currentMonth()};1;100,00;8,00;8,00;92,00`)
    expect(lines.at(-1)).toBe("Total;2;150,00;12,00;8,00;138,00")
  })

  it("não mostra o que é de outro vendedor", async () => {
    await sale(monthsAgo(0), { seller: "outra", gross: 99_900 })
    const text = await (await GET()).text()
    expect(text).not.toContain("999,00")
    expect(text.trim().split("\r\n").at(-1)).toBe("Total;0;0,00;0,00;;0,00")
  })

  it("limite de 10 exportações por hora", async () => {
    for (let i = 0; i < 10; i++) expect((await GET()).status).toBe(200)
    expect((await GET()).status).toBe(429)
  })
})
