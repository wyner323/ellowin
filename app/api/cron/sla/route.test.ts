import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { splitOrderAmount } from "@/lib/money"

/**
 * Rota da rotina de prazos (`/api/cron/sla`): é ela que, de 15 em 15 minutos,
 * reembolsa por atraso, libera ao vendedor depois do prazo de confirmação e
 * confere se a carteira bate. Qualquer pessoa na internet pode tentar chamá-la,
 * então a autenticação por segredo é parte do que se testa, junto com o efeito
 * (dinheiro movido) contra um Postgres em memória com as migrações reais.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  failSweep: null as "dispute" | "delivery" | "autoRelease" | null,
  sentryMessages: [] as { message: string; level?: string }[],
  notifications: [] as [string, number][],
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
vi.mock("@/lib/notify", () => ({
  notifyOrder: (kind: string, orderId: number) => {
    holder.notifications.push([kind, orderId])
  },
  notificationsLive: () => false,
}))
vi.mock("@sentry/nextjs", () => ({
  captureException: () => {},
  captureMessage: (message: string, options?: { level?: string }) => {
    holder.sentryMessages.push({ message, level: options?.level })
  },
}))
// As varreduras reais, com um gancho para simular uma delas quebrando.
vi.mock("@/lib/sla-sweeps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sla-sweeps")>()
  const wrap = (name: "dispute" | "delivery" | "autoRelease", real: () => Promise<number>) => () =>
    holder.failSweep === name ? Promise.reject(new Error(`falha simulada em ${name}`)) : real()
  return {
    ...actual,
    sweepDisputeSla: wrap("dispute", actual.sweepDisputeSla),
    sweepDeliveryDeadline: wrap("delivery", actual.sweepDeliveryDeadline),
    sweepAutoRelease: wrap("autoRelease", actual.sweepAutoRelease),
  }
})

import { GET } from "@/app/api/cron/sla/route"
import { creditAvailable, moveToEscrow, withTransaction } from "@/lib/wallet"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

const SECRET = "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres"

beforeEach(async () => {
  vi.unstubAllEnvs()
  vi.stubEnv("CRON_SECRET", SECRET)
  holder.failSweep = null
  holder.sentryMessages.length = 0
  holder.notifications.length = 0
  await t.query(
    `TRUNCATE "notification_log", "order_message", "dispute_message", "dispute", "wallet_transaction", "order", "product_variant", "product", "wallet", "user" RESTART IDENTITY CASCADE`,
  )
  await t.query(`SELECT setval(pg_get_serial_sequence('"order"', 'id'), 100)`)
  for (const id of ["buyer", "seller"]) {
    await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $1 || '@teste.dev')`, [id])
  }
  await withTransaction((c) => creditAvailable(c, "buyer", 1_000_000, "deposito", "Depósito de teste"))
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

const request = (authorization: string | null) =>
  new Request("http://localhost/api/cron/sla", { headers: authorization === null ? {} : { authorization } })

/** `null` = sem cabeçalho Authorization; sem argumento = o cabeçalho certo. */
const call = (authorization: string | null = `Bearer ${SECRET}`) => GET(request(authorization))

async function rows(text: string, params?: unknown[]) {
  return (await t.query(text, params)).rows
}

const PAST = "now() - interval '1 hour'"

async function createOrder(opts: { status: string; deliveryDueAt?: string; autoReleaseAt?: string; priceCents?: number }) {
  const priceCents = opts.priceCents ?? 10_000
  return withTransaction(async (c) => {
    const { rows: p } = await c.query(
      `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('seller', 'p-' || gen_random_uuid()::text, 'Conta', 'contas') RETURNING "id"`,
    )
    const { rows: v } = await c.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Item', $2, 0) RETURNING "id"`, [p[0].id, priceCents])
    const { amountCents, feeCents, sellerNetCents } = splitOrderAmount(priceCents)
    const { rows: o } = await c.query(
      `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents", "status", "deliveryDueAt", "autoReleaseAt")
       VALUES ('buyer', 'seller', $1, $2, 'Conta', 'Item', $3, $4, $5, $6, ${opts.deliveryDueAt ?? "NULL"}, ${opts.autoReleaseAt ?? "NULL"}) RETURNING "id"`,
      [p[0].id, v[0].id, amountCents, feeCents, sellerNetCents, opts.status],
    )
    await moveToEscrow(c, "buyer", amountCents, "Compra de teste", o[0].id as number)
    return { orderId: o[0].id as number, sellerNetCents }
  })
}

const statusOf = async (id: number) => ((await rows(`SELECT "status" FROM "order" WHERE "id" = $1`, [id]))[0] as { status: string }).status
const wallet = async (userId: string) =>
  (await rows(`SELECT "availableCents", "heldCents" FROM "wallet" WHERE "userId" = $1`, [userId]))[0] as { availableCents: number; heldCents: number } | undefined

/* ---------------------------------------------------------------------------
 * Autenticação
 * ------------------------------------------------------------------------ */

describe("GET /api/cron/sla: autenticação", () => {
  it("sem CRON_SECRET configurada, ninguém entra — nem com 'Bearer undefined' (falha fechada)", async () => {
    vi.stubEnv("CRON_SECRET", "")
    for (const header of [null, "Bearer ", "Bearer undefined", "Bearer", "undefined"]) {
      const res = await call(header)
      expect(res.status, String(header)).toBe(401)
    }
    vi.unstubAllEnvs()
    delete process.env.CRON_SECRET
    expect((await call("Bearer undefined")).status).toBe(401)
  })

  it("recusa sem cabeçalho, com segredo errado, com tamanho diferente e com o esquema errado", async () => {
    for (const header of [null, "", `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(0, -1)}`, "Bearer errado", SECRET, `Basic ${SECRET}`, `bearer ${SECRET}`]) {
      const res = await call(header)
      expect(res.status, String(header)).toBe(401)
      expect(await res.json()).toEqual({ ok: false, error: "Unauthorized" })
    }
  })

  it("recusada, não move dinheiro nem lê a carteira", async () => {
    const o = await createOrder({ status: "aguardando_entrega", deliveryDueAt: PAST })
    expect((await call("Bearer errado")).status).toBe(401)
    expect(await statusOf(o.orderId)).toBe("aguardando_entrega")
    expect(await wallet("buyer")).toEqual({ availableCents: 990_000 + 0, heldCents: 10_000 })
  })

  it("com o segredo certo responde 200", async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })
})

/* ---------------------------------------------------------------------------
 * Efeito: as três varreduras e a conferência
 * ------------------------------------------------------------------------ */

describe("GET /api/cron/sla: o que ela faz", () => {
  it("roda as três varreduras e devolve quantos pedidos cada uma tratou", async () => {
    const atrasado = await createOrder({ status: "aguardando_entrega", deliveryDueAt: PAST })
    const semConfirmar = await createOrder({ status: "entregue", autoReleaseAt: PAST })
    const noPrazo = await createOrder({ status: "aguardando_entrega", deliveryDueAt: "now() + interval '1 hour'" })
    // Disputa sem resposta do vendedor depois do prazo.
    const disputado = await createOrder({ status: "em_disputa" })
    await t.query(
      `INSERT INTO "dispute" ("orderId", "openedBy", "reason", "status", "firstContactDueAt", "sellerResponseDueAt", "resolutionDueAt")
       VALUES ($1, 'buyer', 'diferente', 'aberta', now(), ${PAST}, now() + interval '2 days')`,
      [disputado.orderId],
    )

    const body = await (await call()).json()

    expect(body).toMatchObject({
      ok: true,
      disputeProcessed: 1,
      deliveryProcessed: 1,
      autoReleaseProcessed: 1,
      disputeError: null,
      deliveryError: null,
      autoReleaseError: null,
    })
    expect(await statusOf(atrasado.orderId)).toBe("reembolsado")
    expect(await statusOf(semConfirmar.orderId)).toBe("concluido")
    expect(await statusOf(disputado.orderId)).toBe("reembolsado")
    expect(await statusOf(noPrazo.orderId)).toBe("aguardando_entrega")
    expect(await wallet("seller")).toEqual({ availableCents: semConfirmar.sellerNetCents, heldCents: 0 })
  })

  it("rodar de novo logo em seguida não processa nem paga nada outra vez", async () => {
    await createOrder({ status: "aguardando_entrega", deliveryDueAt: PAST })
    await createOrder({ status: "entregue", autoReleaseAt: PAST })

    await call()
    const second = await (await call()).json()

    expect(second).toMatchObject({ ok: true, disputeProcessed: 0, deliveryProcessed: 0, autoReleaseProcessed: 0 })
    expect(holder.notifications).toHaveLength(2)
  })

  it("sem nada para fazer responde ok com zeros e a conferência batendo", async () => {
    const body = await (await call()).json()
    expect(body).toMatchObject({ ok: true, disputeProcessed: 0, deliveryProcessed: 0, autoReleaseProcessed: 0, reconciliation: { ok: true, findings: [] } })
  })

  it("uma varredura que quebra não impede as outras e o erro aparece no resultado", async () => {
    const atrasado = await createOrder({ status: "aguardando_entrega", deliveryDueAt: PAST })
    const semConfirmar = await createOrder({ status: "entregue", autoReleaseAt: PAST })
    holder.failSweep = "dispute"

    const res = await call()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.disputeProcessed).toBeNull()
    expect(body.disputeError).toContain("falha simulada em dispute")
    expect(body).toMatchObject({ deliveryProcessed: 1, autoReleaseProcessed: 1, deliveryError: null, autoReleaseError: null })
    expect(await statusOf(atrasado.orderId)).toBe("reembolsado")
    expect(await statusOf(semConfirmar.orderId)).toBe("concluido")
  })

  it("cada uma das três pode falhar sozinha", async () => {
    for (const which of ["delivery", "autoRelease"] as const) {
      holder.failSweep = which
      const body = await (await call()).json()
      expect(body[`${which}Error`], which).toContain(`falha simulada em ${which}`)
      expect(body[`${which}Processed`], which).toBeNull()
      expect(body.ok).toBe(true)
    }
  })
})

describe("GET /api/cron/sla: conferência do dinheiro", () => {
  it("depois das varreduras a carteira bate e não há alerta", async () => {
    await createOrder({ status: "aguardando_entrega", deliveryDueAt: PAST })
    await createOrder({ status: "entregue", autoReleaseAt: PAST })

    const body = await (await call()).json()

    expect(body.reconciliation).toEqual({ ok: true, findings: [] })
    expect(holder.sentryMessages).toEqual([])
  })

  it("se a carteira NÃO bate, a resposta traz quais conferências falharam e o Sentry recebe um alerta fatal", async () => {
    await createOrder({ status: "aguardando_entrega" })
    // Saldo mexido à mão, como um bug de código faria.
    await t.query(`UPDATE "wallet" SET "availableCents" = "availableCents" + 777 WHERE "userId" = 'buyer'`)

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const body = await (await call()).json()
    consoleError.mockRestore()

    expect(body.ok).toBe(true) // a rotina em si funcionou; o problema vem no relatório
    expect(body.reconciliation.ok).toBe(false)
    expect(body.reconciliation.findings.map((f: { check: string }) => f.check)).toEqual(expect.arrayContaining(["saldo_vs_extrato", "conservacao_do_dinheiro"]))
    expect(holder.sentryMessages).toEqual([expect.objectContaining({ message: expect.stringContaining("carteira"), level: "fatal" })])
  })
})
