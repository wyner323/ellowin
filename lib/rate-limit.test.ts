import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/** Limitador de taxa em banco (login, cadastro, envios): registra ANTES de contar, janela deslizante, zera sob demanda. */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  headers: {} as Record<string, string>,
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

vi.mock("next/headers", () => ({
  headers: async () => new Headers(holder.headers),
}))

import { clearRateLimit, clientIp, hitRateLimit, isRateLimited, recordFailure } from "@/lib/rate-limit"

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
  await t.query(`TRUNCATE "auth_attempt" RESTART IDENTITY`)
  holder.headers = {}
})

afterEach(() => vi.restoreAllMocks())

const rows = async (key: string) => Number((await t.query(`SELECT count(*) AS n FROM "auth_attempt" WHERE "key" = $1`, [key])).rows[0].n)

describe("isRateLimited / recordFailure (teto de falhas que não renova com a tentativa bloqueada)", () => {
  it("só passa a limitar depois de `max` falhas registradas, e consultar não registra nada", async () => {
    expect(await isRateLimited("falhas:ana", 3, 60)).toBe(false)
    await recordFailure("falhas:ana")
    await recordFailure("falhas:ana")
    expect(await isRateLimited("falhas:ana", 3, 60)).toBe(false)
    await recordFailure("falhas:ana")
    expect(await isRateLimited("falhas:ana", 3, 60)).toBe(true)
    for (let i = 0; i < 5; i++) await isRateLimited("falhas:ana", 3, 60)
    expect(await rows("falhas:ana")).toBe(3) // as consultas bloqueadas não contam
  })

  it("falhas fora da janela deixam de contar e chaves são independentes", async () => {
    for (let i = 0; i < 3; i++) await recordFailure("falhas:ana")
    expect(await isRateLimited("falhas:bia", 3, 60)).toBe(false)
    await t.query(`UPDATE "auth_attempt" SET "createdAt" = (now() at time zone 'UTC') - interval '2 minutes'`)
    expect(await isRateLimited("falhas:ana", 3, 60)).toBe(false)
  })
})

describe("hitRateLimit", () => {
  it("permite até o máximo e bloqueia a tentativa seguinte", async () => {
    const results: boolean[] = []
    for (let i = 0; i < 5; i++) results.push(await hitRateLimit("login:ana", 3, 60))
    expect(results).toEqual([true, true, true, false, false])
  })

  it("registra a tentativa mesmo quando bloqueia (rajada não passa junta)", async () => {
    for (let i = 0; i < 5; i++) await hitRateLimit("login:ana", 3, 60)
    expect(await rows("login:ana")).toBe(5)
  })

  it("chaves diferentes têm contadores independentes", async () => {
    for (let i = 0; i < 4; i++) await hitRateLimit("login:ana", 3, 60)
    expect(await hitRateLimit("login:bia", 3, 60)).toBe(true)
    expect(await hitRateLimit("login:ana", 3, 60)).toBe(false)
  })

  it("a janela é deslizante: tentativas mais velhas que ela deixam de contar", async () => {
    await hitRateLimit("k", 2, 60)
    await hitRateLimit("k", 2, 60)
    await t.query(`UPDATE "auth_attempt" SET "createdAt" = (now() at time zone 'UTC') - interval '2 minutes'`)
    expect(await hitRateLimit("k", 2, 60)).toBe(true) // só esta conta na janela de 60 s
    expect(await hitRateLimit("k", 2, 3600)).toBe(false) // na janela de 1 h as 3 contam
  })

  it("max 0 bloqueia sempre", async () => {
    expect(await hitRateLimit("k", 0, 60)).toBe(false)
  })

  it("limpeza oportunista apaga tentativas com mais de 1 dia (sorteio forçado)", async () => {
    await t.query(`INSERT INTO "auth_attempt" ("key", "createdAt") VALUES ('velha', (now() at time zone 'UTC') - interval '2 days')`)
    await t.query(`INSERT INTO "auth_attempt" ("key", "createdAt") VALUES ('recente', (now() at time zone 'UTC') - interval '2 hours')`)
    vi.spyOn(Math, "random").mockReturnValue(0)
    await hitRateLimit("k", 5, 60)
    expect(await rows("velha")).toBe(0)
    expect(await rows("recente")).toBe(1)
  })

  it("sem o sorteio, nada é limpo", async () => {
    await t.query(`INSERT INTO "auth_attempt" ("key", "createdAt") VALUES ('velha', (now() at time zone 'UTC') - interval '2 days')`)
    vi.spyOn(Math, "random").mockReturnValue(0.5)
    await hitRateLimit("k", 5, 60)
    expect(await rows("velha")).toBe(1)
  })
})

describe("clearRateLimit", () => {
  it("zera só a chave pedida", async () => {
    for (let i = 0; i < 4; i++) await hitRateLimit("login:ana", 3, 60)
    await hitRateLimit("login:bia", 3, 60)
    await clearRateLimit("login:ana")
    expect(await rows("login:ana")).toBe(0)
    expect(await rows("login:bia")).toBe(1)
    expect(await hitRateLimit("login:ana", 3, 60)).toBe(true)
  })
})

describe("clientIp", () => {
  it("usa x-real-ip; senão o primeiro de x-forwarded-for; senão nulo", async () => {
    holder.headers = { "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }
    expect(await clientIp()).toBe("203.0.113.7")
    holder.headers = { "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" }
    expect(await clientIp()).toBe("198.51.100.1")
    holder.headers = {}
    expect(await clientIp()).toBeNull()
  })
})
