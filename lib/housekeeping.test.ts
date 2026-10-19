import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

const holder = vi.hoisted(() => ({ db: null as unknown as TestDb["db"] }))

vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db
  },
}))

import { purgeExpiredRows } from "@/lib/housekeeping"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
}, 60_000)

afterAll(async () => {
  await t.close()
})

beforeEach(async () => {
  await t.query(`TRUNCATE "otp_code", "verification", "session", "user" RESTART IDENTITY CASCADE`)
  await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ('ana', 'Ana', 'ana@teste.dev')`)
})

const count = async (table: string) => (await t.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n as number

describe("purgeExpiredRows", () => {
  it("apaga sessões, tokens e códigos vencidos há mais de um dia e mantém o resto", async () => {
    for (const [id, delta] of [["velha", "- interval '3 days'"], ["recem-vencida", "- interval '2 hours'"], ["valida", "+ interval '2 days'"]]) {
      await t.query(`INSERT INTO "session" ("id", "userId", "token", "expiresAt") VALUES ($1, 'ana', $1, now() ${delta})`, [id])
      await t.query(`INSERT INTO "verification" ("id", "identifier", "value", "expiresAt") VALUES ($1, $1, 'x', now() ${delta})`, [id])
      await t.query(`INSERT INTO "otp_code" ("userId", "channel", "code", "destination", "expiresAt") VALUES ('ana', 'email', $1, 'ana@teste.dev', now() ${delta})`, [id.slice(0, 6)])
    }

    expect(await purgeExpiredRows()).toEqual({ sessions: 1, verifications: 1, otps: 1 })
    expect(await count("session")).toBe(2)
    expect(await count("verification")).toBe(2)
    expect(await count("otp_code")).toBe(2)
    expect((await t.query(`SELECT "id" FROM "session" ORDER BY "id"`)).rows.map((r) => r.id)).toEqual(["recem-vencida", "valida"])
  })

  it("sem nada vencido não apaga nada", async () => {
    expect(await purgeExpiredRows()).toEqual({ sessions: 0, verifications: 0, otps: 0 })
  })
})
