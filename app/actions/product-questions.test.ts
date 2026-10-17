import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Perguntas públicas nos anúncios (perguntar e responder), contra um Postgres em memória
 * com as migrações reais.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
  notifications: [] as unknown[][],
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
  auth: {
    api: {
      getSession: async () => {
        if (!holder.userId) return null
        const { rows } = await holder.pool.query(`SELECT "id", "email", "emailVerified" FROM "user" WHERE "id" = $1`, [holder.userId])
        return rows[0] ? { user: rows[0] } : null
      },
    },
  },
}))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/server", () => ({ after: () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/notify", () => ({
  notifyQuestion: (...args: unknown[]) => holder.notifications.push(args),
}))

import { answerProductQuestion, askProductQuestion } from "@/app/actions/product-questions"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

let productId = 0
let otherProductId = 0

beforeEach(async () => {
  holder.userId = null
  holder.notifications = []
  await t.query(`TRUNCATE "auth_attempt", "product_question", "product", "user" RESTART IDENTITY CASCADE`)
  for (const id of ["vendedor", "ana", "bia"])
    await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES ($1, $1, $1 || '@teste.dev', true)`, [id])
  productId = await addProduct("vendedor")
  otherProductId = await addProduct("vendedor")
})

async function addProduct(sellerId: string) {
  const { rows } = await t.query(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ($1, 'p-' || gen_random_uuid()::text, 'Conta Valorant', 'contas') RETURNING "id"`,
    [sellerId],
  )
  return rows[0].id as number
}

const questions = async () =>
  (await t.query(`SELECT * FROM "product_question" ORDER BY "id"`)).rows as {
    id: number
    askerId: string
    question: string
    answer: string | null
  }[]

describe("askProductQuestion", () => {
  it("grava a pergunta de quem está logado e avisa o vendedor", async () => {
    holder.userId = "ana"
    expect(await askProductQuestion(productId, "  A conta tem skin rara?  ")).toEqual({ ok: true, message: "Pergunta enviada." })

    const [q] = await questions()
    expect(q).toMatchObject({ askerId: "ana", question: "A conta tem skin rara?", answer: null })
    expect(holder.notifications).toEqual([["question_asked", q.id]])
  })

  it("exige login, tamanho válido e anúncio existente que não seja o próprio", async () => {
    holder.userId = null
    await expect(askProductQuestion(productId, "Pergunta válida aqui")).rejects.toThrow("Não autenticado")

    holder.userId = "ana"
    expect(await askProductQuestion(productId, "oi")).toMatchObject({ ok: false })
    expect(await askProductQuestion(productId, "x".repeat(501))).toMatchObject({ ok: false })
    expect(await askProductQuestion(99_999, "Pergunta válida aqui")).toEqual({ ok: false, error: "Anúncio não encontrado." })

    holder.userId = "vendedor"
    expect(await askProductQuestion(productId, "Pergunta no meu anúncio")).toEqual({
      ok: false,
      error: "Você não pode perguntar no seu próprio anúncio.",
    })
    expect(await questions()).toHaveLength(0)
  })

  it("freia a mesma conta que enche o mesmo anúncio (5 por hora) sem travar outro anúncio nem outra conta", async () => {
    holder.userId = "ana"
    for (let i = 0; i < 5; i++) expect(await askProductQuestion(productId, `Pergunta número ${i} aqui`)).toMatchObject({ ok: true })
    expect(await askProductQuestion(productId, "Pergunta número seis")).toEqual({
      ok: false,
      error: "Muitas perguntas em pouco tempo. Tente novamente mais tarde.",
    })
    expect(await questions()).toHaveLength(5)

    // outro anúncio da mesma conta e o mesmo anúncio por outra pessoa continuam livres
    expect(await askProductQuestion(otherProductId, "Pergunta em outro anúncio")).toMatchObject({ ok: true })
    holder.userId = "bia"
    expect(await askProductQuestion(productId, "Pergunta de outra pessoa")).toMatchObject({ ok: true })
  })

  it("tem um teto geral por conta (20 por hora) mesmo espalhando entre anúncios", async () => {
    const ids = [productId, otherProductId]
    for (let i = 0; i < 6; i++) ids.push(await addProduct("vendedor"))
    holder.userId = "ana"
    let ok = 0
    // 4 por anúncio: abaixo do teto de 5 por anúncio, então só o teto geral pode parar
    for (let i = 0; i < 24; i++) {
      const r = await askProductQuestion(ids[i % ids.length], `Pergunta espalhada ${i}`)
      if (r.ok) ok++
    }
    expect(ok).toBe(20)
    expect(await questions()).toHaveLength(20)
  })
})

describe("answerProductQuestion", () => {
  it("só o dono do anúncio responde", async () => {
    holder.userId = "ana"
    await askProductQuestion(productId, "A conta tem skin rara?")
    const [q] = await questions()

    for (const who of ["ana", "bia"]) {
      holder.userId = who
      expect(await answerProductQuestion(q.id, "Tem sim, várias.")).toEqual({ ok: false, error: "Pergunta não encontrada." })
    }
    expect((await questions())[0].answer).toBeNull()

    holder.userId = "vendedor"
    expect(await answerProductQuestion(q.id, "  Tem sim, várias.  ")).toEqual({ ok: true, message: "Resposta publicada." })
    expect((await questions())[0].answer).toBe("Tem sim, várias.")
    expect(holder.notifications.at(-1)).toEqual(["question_answered", q.id])
  })

  it("valida o tamanho da resposta", async () => {
    holder.userId = "ana"
    await askProductQuestion(productId, "A conta tem skin rara?")
    const [q] = await questions()
    holder.userId = "vendedor"
    expect(await answerProductQuestion(q.id, "a")).toMatchObject({ ok: false })
    expect(await answerProductQuestion(q.id, "x".repeat(1001))).toMatchObject({ ok: false })
  })
})
