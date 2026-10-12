import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import type { Finding, ReconciliationReport } from "@/lib/reconcile"

/**
 * Alerta por email quando a conferência da carteira não bate: sai para os
 * administradores, no máximo uma vez por dia para o MESMO conjunto de problemas
 * (a varredura roda a cada 15 minutos), e nunca fora da produção.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  sendMail: vi.fn(),
  captureMessage: vi.fn(),
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

vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendMail: (...args: unknown[]) => holder.sendMail(...args),
}))

vi.mock("next/server", () => ({ after: () => {} }))

vi.mock("@sentry/nextjs", () => ({
  captureException: () => {},
  captureMessage: (...args: unknown[]) => holder.captureMessage(...args),
}))

import { alertIfReconciliationBroken } from "@/lib/reconcile-alert"
import { SITE_URL } from "@/lib/site"

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
  await t.query(`TRUNCATE "notification_log", "user" RESTART IDENTITY CASCADE`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "role") VALUES ('adm1', 'Admin Um', 'adm1@teste.dev', 'admin')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "role") VALUES ('adm2', 'Admin Dois', 'adm2@teste.dev', 'admin')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "role") VALUES ('mod', 'Moderador', 'mod@teste.dev', 'moderator')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ('ana', 'Ana', 'ana@teste.dev')`)
  holder.sendMail.mockReset()
  holder.sendMail.mockResolvedValue({ sent: true })
  holder.captureMessage.mockReset()
  vi.stubEnv("ELLOWIN_NOTIFY", "1")
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function finding(check: string, rows = 1): Finding {
  return { check, description: `descrição de ${check}`, rows: Array.from({ length: rows }, (_, i) => ({ i })) }
}

function report(findings: Finding[], checkedAt = "2026-05-10T12:00:00Z"): ReconciliationReport {
  return {
    ok: findings.length === 0,
    checkedAt: new Date(checkedAt),
    totals: { wallets: 1, orders: 1, ledgerEntries: 1 },
    findings,
  }
}

type MailArgs = [to: string, subject: string, html: string, label: string]
const mails = () => holder.sendMail.mock.calls as MailArgs[]
const logCount = async () => Number((await t.query(`SELECT count(*) AS n FROM "notification_log"`)).rows[0].n)

describe("alertIfReconciliationBroken", () => {
  it("tudo certo: não faz nada (nem Sentry, nem email)", async () => {
    expect(await alertIfReconciliationBroken(report([]))).toEqual({ alerted: false })
    expect(holder.captureMessage).not.toHaveBeenCalled()
    expect(holder.sendMail).not.toHaveBeenCalled()
    expect(await logCount()).toBe(0)
  })

  it("problema achado: avisa SÓ os administradores, uma vez cada, com o resumo e o link da conferência", async () => {
    const r = await alertIfReconciliationBroken(report([finding("saldo-vs-extrato", 2), finding("pedido-duplicado")]))
    expect(r).toEqual({ alerted: true })
    expect(mails().map((m) => m[0]).sort()).toEqual(["adm1@teste.dev", "adm2@teste.dev"])
    const [, subject, html, label] = mails()[0]
    expect(subject).toBe("Alerta: a carteira da Ellowin não bate")
    expect(html).toContain("descrição de saldo-vs-extrato (2)")
    expect(html).toContain("descrição de pedido-duplicado (1)")
    expect(html).toContain(`${SITE_URL}/admin/conferencia`)
    expect(label).toBe("alerta de conferência da carteira")
    expect(await logCount()).toBe(2)
  })

  it("não vaza as linhas dos achados no email (só a contagem)", async () => {
    await alertIfReconciliationBroken(
      report([{ check: "x", description: "algo errado", rows: [{ userId: "ana", balanceCents: 987654 }] }]),
    )
    expect(mails()[0][2]).not.toContain("987654")
    expect(mails()[0][2]).not.toContain("ana@teste.dev")
  })

  it("a varredura repetida no mesmo dia, com os mesmos problemas, não manda de novo", async () => {
    const problemas = [finding("a", 2), finding("b")]
    await alertIfReconciliationBroken(report(problemas, "2026-05-10T03:00:00Z"))
    holder.sendMail.mockClear()
    const outra = await alertIfReconciliationBroken(report(problemas, "2026-05-10T18:30:00Z"))
    expect(outra).toEqual({ alerted: false })
    expect(holder.sendMail).not.toHaveBeenCalled()
  })

  it("a ordem dos achados não importa para a repetição", async () => {
    await alertIfReconciliationBroken(report([finding("a"), finding("b")]))
    holder.sendMail.mockClear()
    await alertIfReconciliationBroken(report([finding("b"), finding("a")]))
    expect(holder.sendMail).not.toHaveBeenCalled()
  })

  it("problemas diferentes (outra checagem ou outra quantidade) avisam de novo no mesmo dia", async () => {
    await alertIfReconciliationBroken(report([finding("a")]))
    holder.sendMail.mockClear()
    await alertIfReconciliationBroken(report([finding("a"), finding("b")]))
    expect(holder.sendMail).toHaveBeenCalledTimes(2)
    holder.sendMail.mockClear()
    await alertIfReconciliationBroken(report([finding("a", 3), finding("b")]))
    expect(holder.sendMail).toHaveBeenCalledTimes(2)
  })

  it("o mesmo problema no DIA SEGUINTE avisa de novo", async () => {
    await alertIfReconciliationBroken(report([finding("a")], "2026-05-10T23:50:00Z"))
    holder.sendMail.mockClear()
    await alertIfReconciliationBroken(report([finding("a")], "2026-05-11T00:10:00Z"))
    expect(holder.sendMail).toHaveBeenCalledTimes(2)
  })

  it("envio que falha libera a reserva e conta como não alertado; a próxima varredura tenta de novo", async () => {
    holder.sendMail.mockResolvedValue({ sent: false, error: "sem chave" })
    expect(await alertIfReconciliationBroken(report([finding("a")]))).toEqual({ alerted: false })
    expect(await logCount()).toBe(0)

    holder.sendMail.mockResolvedValue({ sent: true })
    expect(await alertIfReconciliationBroken(report([finding("a")]))).toEqual({ alerted: true })
    expect(await logCount()).toBe(2)
  })

  it("um administrador com falha não impede o outro, e só o que falhou é reenviado", async () => {
    holder.sendMail.mockImplementation(async (to: string) => ({ sent: to !== "adm1@teste.dev" }))
    expect(await alertIfReconciliationBroken(report([finding("a")]))).toEqual({ alerted: true })
    expect(await logCount()).toBe(1)

    holder.sendMail.mockClear()
    holder.sendMail.mockResolvedValue({ sent: true })
    await alertIfReconciliationBroken(report([finding("a")]))
    expect(mails().map((m) => m[0])).toEqual(["adm1@teste.dev"])
  })

  it("sem administradores: nada a enviar", async () => {
    await t.query(`UPDATE "user" SET "role" = 'user' WHERE "role" = 'admin'`)
    expect(await alertIfReconciliationBroken(report([finding("a")]))).toEqual({ alerted: false })
    expect(holder.sendMail).not.toHaveBeenCalled()
  })

  it("FORA da produção não envia nem reserva, mas o Sentry e o log de erro continuam", async () => {
    vi.stubEnv("ELLOWIN_NOTIFY", "")
    expect(await alertIfReconciliationBroken(report([finding("a")]))).toEqual({ alerted: false })
    expect(holder.sendMail).not.toHaveBeenCalled()
    expect(await logCount()).toBe(0)
    expect(holder.captureMessage).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalled()
  })

  it("o Sentry recebe nível fatal e agrupa pelas checagens que falharam (não pelo texto nem pelo dia)", async () => {
    await alertIfReconciliationBroken(report([finding("b", 4), finding("a")], "2026-05-10T12:00:00Z"))
    const [mensagem, opcoes] = holder.captureMessage.mock.calls[0]
    expect(mensagem).toBe("Conferência da carteira encontrou inconsistências")
    expect(opcoes.level).toBe("fatal")
    expect(opcoes.tags).toEqual({ area: "reconcile" })
    expect(opcoes.fingerprint).toEqual(["reconcile-broken", "a", "b"])
    expect(opcoes.extra.findings).toEqual([
      { check: "b", count: 4 },
      { check: "a", count: 1 },
    ])
  })
})
