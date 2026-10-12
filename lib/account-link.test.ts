import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Login com Google sobre uma conta que já existe com o mesmo email. Se o email da
 * conta local NÃO estava verificado, quem pré-cadastrou com uma senha própria
 * (um invasor) perde a senha e as sessões antes do vínculo. Conta verificada não
 * é tocada.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
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

import { neutralizeUnverifiedCredentials } from "@/lib/account-link"

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
  await t.query(`TRUNCATE "session", "account", "user" RESTART IDENTITY CASCADE`)
})

async function addUser(id: string, emailVerified: boolean) {
  await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES ($1, $1, $1 || '@teste.dev', $2)`, [id, emailVerified])
  await t.query(`INSERT INTO "account" ("id", "accountId", "providerId", "userId", "password") VALUES ($1, $2, 'credential', $2, 'hash-da-senha')`, [`cred-${id}`, id])
  await t.query(`INSERT INTO "account" ("id", "accountId", "providerId", "userId") VALUES ($1, $2, 'google', $3)`, [`goog-${id}`, `g-${id}`, id])
  await t.query(`INSERT INTO "session" ("id", "token", "expiresAt", "userId") VALUES ($1, $2, '2099-01-01', $3)`, [`s1-${id}`, `t1-${id}`, id])
  await t.query(`INSERT INTO "session" ("id", "token", "expiresAt", "userId") VALUES ($1, $2, '2099-01-01', $3)`, [`s2-${id}`, `t2-${id}`, id])
}

const count = async (table: string, userId: string, extra = "") =>
  Number((await t.query(`SELECT count(*) AS n FROM "${table}" WHERE "userId" = $1 ${extra}`, [userId])).rows[0].n)

describe("neutralizeUnverifiedCredentials", () => {
  it("email NÃO verificado: apaga a senha e todas as sessões, e devolve quantas linhas saíram", async () => {
    await addUser("invadida", false)
    expect(await neutralizeUnverifiedCredentials("invadida")).toBe(3) // 1 credencial + 2 sessões
    expect(await count("account", "invadida", `AND "providerId" = 'credential'`)).toBe(0)
    expect(await count("session", "invadida")).toBe(0)
  })

  it("mantém o vínculo social (Google) — só a credencial de senha sai", async () => {
    await addUser("invadida", false)
    await neutralizeUnverifiedCredentials("invadida")
    expect(await count("account", "invadida", `AND "providerId" = 'google'`)).toBe(1)
  })

  it("email JÁ verificado: não mexe em senha nem em sessões", async () => {
    await addUser("dona", true)
    expect(await neutralizeUnverifiedCredentials("dona")).toBe(0)
    expect(await count("account", "dona", `AND "providerId" = 'credential'`)).toBe(1)
    expect(await count("session", "dona")).toBe(2)
  })

  it("só atinge o usuário indicado", async () => {
    await addUser("invadida", false)
    await addUser("outra", false)
    await neutralizeUnverifiedCredentials("invadida")
    expect(await count("account", "outra", `AND "providerId" = 'credential'`)).toBe(1)
    expect(await count("session", "outra")).toBe(2)
  })

  it("usuário inexistente: nada acontece", async () => {
    await addUser("outra", false)
    expect(await neutralizeUnverifiedCredentials("fantasma")).toBe(0)
    expect(await count("session", "outra")).toBe(2)
  })

  it("conta não verificada sem senha nem sessão: zero linhas", async () => {
    await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES ('vazia', 'v', 'v@teste.dev', false)`)
    expect(await neutralizeUnverifiedCredentials("vazia")).toBe(0)
  })
})
