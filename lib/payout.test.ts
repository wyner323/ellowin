import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/** Destino de saque mostrado na carteira: vendedor aprovado + Pix + trava de 24 h após trocar a chave. A chave só sai mascarada. */

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

import { getPayoutState } from "@/lib/payout"

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
  await t.query(`TRUNCATE "seller_application", "user" RESTART IDENTITY CASCADE`)
  await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ('ana', 'Ana', 'ana@teste.dev')`)
})

/** `changedHoursAgo`: há quantas horas a chave mudou (nulo = nunca registrada). */
async function addSeller(opts: { status?: string; pixKey?: string | null; pixType?: string | null; changedHoursAgo?: number | null }) {
  await t.query(
    `INSERT INTO "seller_application" ("userId", "status", "pixKey", "pixKeyType", "pixKeyChangedAt")
     VALUES ('ana', $1, $2, $3, CASE WHEN $4::float IS NULL THEN NULL ELSE (now() at time zone 'UTC') - make_interval(secs => $4::float * 3600) END)`,
    [opts.status ?? "aprovado", opts.pixKey === undefined ? "52998224725" : opts.pixKey, opts.pixType === undefined ? "cpf" : opts.pixType, opts.changedHoursAgo ?? null],
  )
}

describe("getPayoutState", () => {
  it("quem não é vendedor aprovado não tem saque", async () => {
    expect(await getPayoutState("ana")).toEqual({ kind: "unavailable", reason: "not_seller" })
    await addSeller({ status: "em_andamento" })
    expect(await getPayoutState("ana")).toEqual({ kind: "unavailable", reason: "not_seller" })
  })

  it("aprovado mas sem chave Pix cadastrada", async () => {
    await addSeller({ pixKey: null, pixType: null })
    expect(await getPayoutState("ana")).toEqual({ kind: "unavailable", reason: "no_pix" })
    await t.query(`UPDATE "seller_application" SET "pixKey" = ''`)
    expect(await getPayoutState("ana")).toEqual({ kind: "unavailable", reason: "no_pix" })
  })

  it("chave trocada há menos de 24 h: trava, com os segundos que faltam", async () => {
    await addSeller({ changedHoursAgo: 20 })
    const s = await getPayoutState("ana")
    expect(s.kind).toBe("locked")
    if (s.kind !== "locked") return
    expect(s.pixType).toBe("cpf")
    expect(s.secondsLeft).toBeGreaterThan(4 * 3600 - 60)
    expect(s.secondsLeft).toBeLessThanOrEqual(4 * 3600)
  })

  it("chave trocada agora: quase 24 h de trava", async () => {
    await addSeller({ changedHoursAgo: 0 })
    const s = await getPayoutState("ana")
    expect(s.kind).toBe("locked")
    if (s.kind === "locked") expect(s.secondsLeft).toBeGreaterThan(24 * 3600 - 60)
  })

  it("passadas as 24 h (ou nunca trocada), o saque está liberado", async () => {
    await addSeller({ changedHoursAgo: 25 })
    expect((await getPayoutState("ana")).kind).toBe("ready")
    await t.query(`UPDATE "seller_application" SET "pixKeyChangedAt" = NULL`)
    expect((await getPayoutState("ana")).kind).toBe("ready")
  })

  it("a chave sai MASCARADA, nunca inteira", async () => {
    await addSeller({ pixKey: "52998224725", pixType: "cpf", changedHoursAgo: 48 })
    const s = await getPayoutState("ana")
    expect(s).toEqual({ kind: "ready", destination: "***.982.247-**", pixType: "cpf" })
    expect(JSON.stringify(s)).not.toContain("52998224725")

    await t.query(`UPDATE "seller_application" SET "pixKey" = 'ana.silva@teste.dev', "pixKeyType" = 'email'`)
    const email = await getPayoutState("ana")
    expect(email).toMatchObject({ kind: "ready", destination: "an***@teste.dev", pixType: "email" })
    expect(JSON.stringify(email)).not.toContain("ana.silva")
  })

  it("tipo de chave ausente vira texto vazio, e o destino fica genérico", async () => {
    await addSeller({ pixKey: "qualquer-coisa", pixType: null, changedHoursAgo: 48 })
    expect(await getPayoutState("ana")).toEqual({ kind: "ready", destination: "***", pixType: "" })
  })
})
