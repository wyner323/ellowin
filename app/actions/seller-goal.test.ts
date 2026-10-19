import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

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
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.4" }) }))
vi.mock("next/server", () => ({ after: () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => holder.revalidated.push(p) }))

import { setMonthlyGoal } from "@/app/actions/seller-goal"
import { getMonthProgressInputs } from "@/lib/seller-goals"

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
  holder.userId = "ana"
  holder.revalidated = []
  await t.query(`TRUNCATE "auth_attempt", "seller_goal", "seller_application", "user" RESTART IDENTITY CASCADE`)
  for (const id of ["ana", "bia", "novo"]) await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $1 || '@t.dev')`, [id])
  await t.query(`INSERT INTO "seller_application" ("userId", "status") VALUES ('ana', 'aprovado'), ('bia', 'aprovado'), ('novo', 'em_andamento')`)
})

const goalOf = async (id: string) => (await getMonthProgressInputs(id)).goalCents

describe("setMonthlyGoal", () => {
  it("exige login e vendedor aprovado", async () => {
    holder.userId = null
    await expect(setMonthlyGoal("1.000,00")).rejects.toThrow("Não autenticado")
    holder.userId = "novo"
    expect(await setMonthlyGoal("1.000,00")).toEqual({ ok: false, error: "Apenas vendedores aprovados podem definir uma meta." })
    expect(await goalOf("novo")).toBeNull()
  })

  it("grava só a meta de quem está logado, em centavos, e atualiza o painel", async () => {
    const r = await setMonthlyGoal("5.000,00")
    expect(r.ok).toBe(true)
    expect(r.message).toContain("5.000,00")
    expect(await goalOf("ana")).toBe(500_000)
    expect(await goalOf("bia")).toBeNull()
    expect(holder.revalidated).toEqual(["/painel/vendedor"])
  })

  it("campo vazio remove a meta", async () => {
    await setMonthlyGoal("2.000,00")
    expect(await setMonthlyGoal("   ")).toEqual({ ok: true, message: "Meta removida." })
    expect(await goalOf("ana")).toBeNull()
  })

  it("recusa valor pequeno demais, grande demais ou que não é número, sem gravar", async () => {
    await setMonthlyGoal("1.000,00")
    for (const bad of ["abc", "10,00", "0", "-50", "10.000.001,00"])
      expect(await setMonthlyGoal(bad), bad).toMatchObject({ ok: false, field: "amount" })
    expect(await goalOf("ana")).toBe(100_000)
  })

  it("no máximo 20 alterações por hora", async () => {
    for (let i = 0; i < 20; i++) expect((await setMonthlyGoal(`${100 + i},00`)).ok).toBe(true)
    expect(await setMonthlyGoal("500,00")).toEqual({ ok: false, error: "Muitas alterações em pouco tempo. Tente de novo mais tarde." })
  })

  it("sem a tabela (migração pendente) devolve uma mensagem clara, sem derrubar", async () => {
    await t.query(`ALTER TABLE "seller_goal" RENAME TO "seller_goal_off"`)
    try {
      expect(await setMonthlyGoal("1.000,00")).toEqual({ ok: false, error: "Não foi possível salvar a meta agora. Tente de novo em instantes." })
    } finally {
      await t.query(`ALTER TABLE "seller_goal_off" RENAME TO "seller_goal"`)
    }
  })
})
