import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Modo férias (setStoreVacation) contra um Postgres em memória com as migrações reais: a sessão e o cache do
 * Next são simulados; as regras de vendedor, e-mail confirmado e o limite de volume são o código de verdade.
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

import { setStoreVacation } from "@/app/actions/vacation"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

async function addUser(id: string, { seller, emailVerified = true }: { seller?: string; emailVerified?: boolean } = {}) {
  await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES ($1, $1, $1 || '@teste.dev', $2)`, [id, emailVerified])
  await t.query(
    `INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "birthDate") VALUES ($1, $1, '52998224725', '11999999999', '1990-01-01')`,
    [id],
  )
  if (seller) await t.query(`INSERT INTO "seller_application" ("userId", "status", "storeSlug") VALUES ($1, $2, $1 || '-store')`, [id, seller])
}

beforeEach(async () => {
  holder.userId = null
  holder.revalidated.length = 0
  await t.query(`TRUNCATE "auth_attempt", "product", "seller_application", "profile", "user" RESTART IDENTITY CASCADE`)
  await addUser("ana", { seller: "aprovado" })
  await addUser("bia", { seller: "aprovado" })
  await addUser("cadu") // nunca virou vendedor
  await addUser("pendente", { seller: "em_andamento" })
  await addUser("sem-email", { seller: "aprovado", emailVerified: false })
})

async function add(seller: string, slug: string, status = "ativo") {
  await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "status") VALUES ($1, $2, $2, 'contas', $3)`, [seller, slug, status])
}

async function statuses(seller: string) {
  const { rows } = await t.query(`SELECT "slug", "status" FROM "product" WHERE "sellerId" = $1 ORDER BY "slug"`, [seller])
  return Object.fromEntries(rows.map((r) => [r.slug as string, r.status as string]))
}

describe("setStoreVacation", () => {
  it("liga: só os anúncios ATIVOS do vendedor vão para férias; o pausado à mão e os dos outros ficam como estão", async () => {
    await add("ana", "a1")
    await add("ana", "a2")
    await add("ana", "a3", "pausado")
    await add("bia", "b1")
    holder.userId = "ana"
    const r = await setStoreVacation(true)
    expect(r).toMatchObject({ ok: true })
    expect(r.message).toContain("2 anúncios")
    expect(await statuses("ana")).toEqual({ a1: "ferias", a2: "ferias", a3: "pausado" })
    expect(await statuses("bia")).toEqual({ b1: "ativo" })
    expect(holder.revalidated).toContain("/painel/vendedor/produtos")
  })

  it("desliga: devolve só o que o modo férias escondeu, nunca o pausado à mão", async () => {
    await add("ana", "a1", "ferias")
    await add("ana", "a2", "ferias")
    await add("ana", "a3", "pausado")
    holder.userId = "ana"
    const r = await setStoreVacation(false)
    expect(r.ok).toBe(true)
    expect(await statuses("ana")).toEqual({ a1: "ativo", a2: "ativo", a3: "pausado" })
  })

  it("ida e volta preserva o que estava pausado", async () => {
    await add("ana", "a1")
    await add("ana", "a2", "pausado")
    holder.userId = "ana"
    await setStoreVacation(true)
    await setStoreVacation(false)
    expect(await statuses("ana")).toEqual({ a1: "ativo", a2: "pausado" })
  })

  it("sem anúncios ativos (ou sem nenhum em férias) avisa e não muda nada", async () => {
    await add("ana", "a1", "pausado")
    holder.userId = "ana"
    expect(await setStoreVacation(true)).toMatchObject({ ok: false, error: expect.stringContaining("ativos") })
    expect(await setStoreVacation(false)).toMatchObject({ ok: false, error: expect.stringContaining("férias") })
    expect(await statuses("ana")).toEqual({ a1: "pausado" })
  })

  it("só vendedor aprovado: comprador comum e candidato em andamento são recusados", async () => {
    await add("cadu", "c1")
    await add("pendente", "p1")
    holder.userId = "cadu"
    expect(await setStoreVacation(true)).toMatchObject({ ok: false })
    holder.userId = "pendente"
    expect(await setStoreVacation(true)).toMatchObject({ ok: false })
    expect(await statuses("cadu")).toEqual({ c1: "ativo" })
    expect(await statuses("pendente")).toEqual({ p1: "ativo" })
  })

  it("voltar a vender exige e-mail confirmado; entrar em férias não", async () => {
    await add("sem-email", "s1")
    holder.userId = "sem-email"
    expect(await setStoreVacation(true)).toMatchObject({ ok: true })
    expect(await setStoreVacation(false)).toMatchObject({ ok: false, field: "email" })
    expect(await statuses("sem-email")).toEqual({ s1: "ferias" })
  })

  it("limite de 10 alterações por hora", async () => {
    await add("ana", "a1")
    holder.userId = "ana"
    for (let i = 0; i < 10; i++) await setStoreVacation(i % 2 === 0)
    expect(await setStoreVacation(true)).toMatchObject({ ok: false, error: expect.stringContaining("Muitas") })
  })

  it("anúncio em férias não aceita compra nem aparece como à venda (todo leitor público exige 'ativo')", async () => {
    await add("ana", "a1")
    holder.userId = "ana"
    await setStoreVacation(true)
    const { rows } = await t.query(`SELECT count(*)::int AS n FROM "product" WHERE "status" = 'ativo'`)
    expect(rows[0].n).toBe(0)
  })
})
