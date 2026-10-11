import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { splitOrderAmount } from "@/lib/money"

/**
 * As três varreduras automáticas (`lib/sla-sweeps.ts`) movem dinheiro sozinhas a
 * cada 15 minutos, sem ninguém olhando: reembolso por prazo de entrega, reembolso
 * por vendedor que não responde disputa e liberação ao vendedor depois do prazo de
 * confirmação. Aqui rodam contra um Postgres em memória com as migrações reais.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  notifications: [] as [string, number][],
  captured: [] as unknown[],
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
}))
vi.mock("@sentry/nextjs", () => ({
  captureException: (error: unknown) => {
    holder.captured.push(error)
  },
}))

import { sweepAutoRelease, sweepDeliveryDeadline, sweepDisputeSla } from "@/lib/sla-sweeps"
import { creditAvailable, moveToEscrow, withTransaction } from "@/lib/wallet"
import { runWalletReconciliation } from "@/lib/reconcile"

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
  holder.notifications.length = 0
  holder.captured.length = 0
  await t.query(
    `TRUNCATE "wallet_transaction", "order_message", "dispute_message", "dispute", "order", "product_variant", "product", "wallet", "user" RESTART IDENTITY CASCADE`,
  )
  // Pedidos 1–5 são a carga de demonstração antiga para a conferência (lib/reconcile.ts).
  await t.query(`SELECT setval(pg_get_serial_sequence('"order"', 'id'), 100)`)
  for (const id of ["buyer", "seller"]) {
    await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $1 || '@teste.dev')`, [id])
  }
  await withTransaction((c) => creditAvailable(c, "buyer", 100_000, "deposito", "Depósito de teste"))
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

type OrderOpts = {
  priceCents?: number
  status?: string
  /** Expressão SQL para a coluna (ex.: "now() - interval '1 hour'") ou null. */
  deliveryDueAt?: string | null
  autoReleaseAt?: string | null
}

const PAST = "now() - interval '1 hour'"
const FUTURE = "now() + interval '1 hour'"

/** Pedido já com o dinheiro em custódia, como a compra deixa. */
async function createOrder({ priceCents = 10_000, status = "aguardando_entrega", deliveryDueAt = null, autoReleaseAt = null }: OrderOpts = {}) {
  return withTransaction(async (c) => {
    const { rows: p } = await c.query(
      `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('seller', 'p-' || gen_random_uuid()::text, 'Conta de teste', 'contas') RETURNING "id"`,
    )
    const { rows: v } = await c.query(
      `INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Item', $2, 0) RETURNING "id"`,
      [p[0].id, priceCents],
    )
    const { amountCents, feeCents, sellerNetCents } = splitOrderAmount(priceCents)
    const { rows: o } = await c.query(
      `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents", "status", "deliveryDueAt", "autoReleaseAt")
       VALUES ('buyer', 'seller', $1, $2, 'Conta de teste', 'Item', $3, $4, $5, $6, ${deliveryDueAt ?? "NULL"}, ${autoReleaseAt ?? "NULL"}) RETURNING "id"`,
      [p[0].id, v[0].id, amountCents, feeCents, sellerNetCents, status],
    )
    const orderId = o[0].id as number
    await moveToEscrow(c, "buyer", amountCents, "Compra de teste", orderId)
    return { orderId, productId: p[0].id as number, variantId: v[0].id as number, amountCents, feeCents, sellerNetCents }
  })
}

async function one<T = Record<string, unknown>>(text: string, params?: unknown[]) {
  const { rows } = await t.query(text, params)
  return rows[0] as T
}

const wallet = (userId: string) =>
  one<{ availableCents: number; heldCents: number }>(
    `SELECT "availableCents", "heldCents" FROM "wallet" WHERE "userId" = $1`,
    [userId],
  )

const orderRow = (id: number) =>
  one<{ status: string; completedAt: Date | null }>(`SELECT "status", "completedAt" FROM "order" WHERE "id" = $1`, [id])

const messages = async (orderId: number) =>
  (await t.query(`SELECT "authorRole", "body" FROM "order_message" WHERE "orderId" = $1`, [orderId])).rows as {
    authorRole: string
    body: string
  }[]

/* ---------------------------------------------------------------------------
 * Liberação automática ao vendedor
 * ------------------------------------------------------------------------ */

describe("sweepAutoRelease", () => {
  it("libera ao vendedor (menos a taxa) o pedido entregue cujo prazo de confirmação passou", async () => {
    const o = await createOrder({ status: "entregue", autoReleaseAt: PAST })

    expect(await sweepAutoRelease()).toBe(1)

    expect((await orderRow(o.orderId)).status).toBe("concluido")
    expect((await orderRow(o.orderId)).completedAt).not.toBeNull()
    expect(await wallet("seller")).toEqual({ availableCents: o.sellerNetCents, heldCents: 0 })
    expect(await wallet("buyer")).toEqual({ availableCents: 90_000, heldCents: 0 })
    expect((await one<{ salesCount: number }>(`SELECT "salesCount" FROM "product" WHERE "id" = $1`, [o.productId])).salesCount).toBe(1)
    expect(await messages(o.orderId)).toEqual([
      expect.objectContaining({ authorRole: "system", body: expect.stringContaining("liberado ao vendedor") }),
    ])
    expect(holder.notifications).toEqual([["order_auto_completed", o.orderId]])
  })

  it("não toca em pedido ainda dentro do prazo, sem prazo ou em outro status", async () => {
    const noPrazo = await createOrder({ status: "entregue", autoReleaseAt: FUTURE })
    const semPrazo = await createOrder({ status: "entregue", autoReleaseAt: null })
    const aguardando = await createOrder({ status: "aguardando_entrega", autoReleaseAt: PAST })
    const emDisputa = await createOrder({ status: "em_disputa", autoReleaseAt: PAST })

    expect(await sweepAutoRelease()).toBe(0)

    for (const o of [noPrazo, semPrazo]) expect((await orderRow(o.orderId)).status).toBe("entregue")
    expect((await orderRow(aguardando.orderId)).status).toBe("aguardando_entrega")
    expect((await orderRow(emDisputa.orderId)).status).toBe("em_disputa")
    expect(await wallet("seller")).toBeUndefined()
  })

  it("rodar de novo não paga duas vezes", async () => {
    const o = await createOrder({ status: "entregue", autoReleaseAt: PAST })

    expect(await sweepAutoRelease()).toBe(1)
    expect(await sweepAutoRelease()).toBe(0)

    expect(await wallet("seller")).toEqual({ availableCents: o.sellerNetCents, heldCents: 0 })
    expect(holder.notifications).toHaveLength(1)
  })

  it("um pedido com problema não trava os demais e o erro é registrado", async () => {
    const quebrado = await createOrder({ status: "entregue", autoReleaseAt: PAST })
    const bom = await createOrder({ status: "entregue", autoReleaseAt: PAST })
    // Custódia do primeiro some (como se outra rota o tivesse liquidado): liberar falharia.
    await t.query(`UPDATE "wallet" SET "heldCents" = "heldCents" - $1 WHERE "userId" = 'buyer'`, [quebrado.amountCents])
    // Sem custódia para os dois, só o segundo (que ainda tem a sua) pode passar:
    // o primeiro processado pela varredura consome a custódia que sobrou.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    const processed = await sweepAutoRelease()
    consoleError.mockRestore()

    expect(processed).toBe(1)
    expect(holder.captured).toHaveLength(1)
    const statuses = [(await orderRow(quebrado.orderId)).status, (await orderRow(bom.orderId)).status].sort()
    expect(statuses).toEqual(["concluido", "entregue"])
  })

  it("depois de varrer, a conferência do dinheiro continua batendo", async () => {
    await createOrder({ status: "entregue", autoReleaseAt: PAST })
    await createOrder({ status: "entregue", autoReleaseAt: FUTURE })
    await sweepAutoRelease()

    const report = await runWalletReconciliation()
    expect(report.findings).toEqual([])
  })
})

/* ---------------------------------------------------------------------------
 * Reembolso por prazo de entrega
 * ------------------------------------------------------------------------ */

describe("sweepDeliveryDeadline", () => {
  it("reembolsa o pedido sem entrega depois do prazo, repõe o estoque e avisa no chat", async () => {
    const o = await createOrder({ status: "aguardando_entrega", deliveryDueAt: PAST })

    expect(await sweepDeliveryDeadline()).toBe(1)

    expect((await orderRow(o.orderId)).status).toBe("reembolsado")
    expect(await wallet("buyer")).toEqual({ availableCents: 100_000, heldCents: 0 })
    expect(await wallet("seller")).toBeUndefined()
    expect((await one<{ stock: number }>(`SELECT "stock" FROM "product_variant" WHERE "id" = $1`, [o.variantId])).stock).toBe(1)
    expect(await messages(o.orderId)).toEqual([
      expect.objectContaining({ authorRole: "system", body: expect.stringContaining("devolvido ao comprador") }),
    ])
    expect(holder.notifications).toEqual([["order_refunded_deadline", o.orderId]])
  })

  it("não reembolsa quem ainda está no prazo, entrega automática (sem prazo) ou já entregue", async () => {
    const noPrazo = await createOrder({ deliveryDueAt: FUTURE })
    const automatica = await createOrder({ deliveryDueAt: null })
    const entregue = await createOrder({ status: "entregue", deliveryDueAt: PAST })

    expect(await sweepDeliveryDeadline()).toBe(0)

    expect((await orderRow(noPrazo.orderId)).status).toBe("aguardando_entrega")
    expect((await orderRow(automatica.orderId)).status).toBe("aguardando_entrega")
    expect((await orderRow(entregue.orderId)).status).toBe("entregue")
  })

  it("rodar de novo não devolve o dinheiro nem o estoque duas vezes", async () => {
    const o = await createOrder({ deliveryDueAt: PAST })
    await sweepDeliveryDeadline()
    await sweepDeliveryDeadline()

    expect(await wallet("buyer")).toEqual({ availableCents: 100_000, heldCents: 0 })
    expect((await one<{ stock: number }>(`SELECT "stock" FROM "product_variant" WHERE "id" = $1`, [o.variantId])).stock).toBe(1)
  })

  it("se a custódia já foi baixada, o pedido não muda de status e nada é devolvido a mais", async () => {
    const o = await createOrder({ deliveryDueAt: PAST })
    await t.query(`UPDATE "wallet" SET "heldCents" = 0 WHERE "userId" = 'buyer'`)
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(await sweepDeliveryDeadline()).toBe(0)
    consoleError.mockRestore()

    expect((await orderRow(o.orderId)).status).toBe("aguardando_entrega")
    expect((await wallet("buyer")).availableCents).toBe(90_000)
    expect(holder.captured).toHaveLength(1)
  })

  it("depois de varrer, a conferência do dinheiro continua batendo", async () => {
    await createOrder({ deliveryDueAt: PAST })
    await createOrder({ deliveryDueAt: FUTURE })
    await sweepDeliveryDeadline()

    expect((await runWalletReconciliation()).findings).toEqual([])
  })
})

/* ---------------------------------------------------------------------------
 * Reembolso por vendedor que não responde a disputa
 * ------------------------------------------------------------------------ */

async function openDispute(orderId: number, opts: { sellerResponseDueAt: string; sellerResponded?: boolean; status?: string }) {
  await t.query(`UPDATE "order" SET "status" = 'em_disputa' WHERE "id" = $1`, [orderId])
  const { rows } = await t.query(
    `INSERT INTO "dispute" ("orderId", "openedBy", "reason", "status", "firstContactDueAt", "sellerResponseDueAt", "resolutionDueAt", "sellerFirstResponseAt")
     VALUES ($1, 'buyer', 'nao_recebi', $2, now(), ${opts.sellerResponseDueAt}, now() + interval '2 days', ${opts.sellerResponded ? "now()" : "NULL"}) RETURNING "id"`,
    [orderId, opts.status ?? "aberta"],
  )
  return rows[0].id as number
}

const disputeRow = (id: number) =>
  one<{ status: string; resolution: string | null; resolvedAt: Date | null }>(
    `SELECT "status", "resolution", "resolvedAt" FROM "dispute" WHERE "id" = $1`,
    [id],
  )

describe("sweepDisputeSla", () => {
  it("reembolsa o comprador quando o vendedor não respondeu no prazo e fecha a disputa", async () => {
    const o = await createOrder({ status: "entregue" })
    const d = await openDispute(o.orderId, { sellerResponseDueAt: PAST })

    expect(await sweepDisputeSla()).toBe(1)

    expect((await orderRow(o.orderId)).status).toBe("reembolsado")
    expect(await wallet("buyer")).toEqual({ availableCents: 100_000, heldCents: 0 })
    expect(await wallet("seller")).toBeUndefined()
    expect(await disputeRow(d)).toMatchObject({ status: "resolvida_comprador" })
    expect((await disputeRow(d)).resolvedAt).not.toBeNull()
    const msgs = (await t.query(`SELECT "authorRole" FROM "dispute_message" WHERE "disputeId" = $1`, [d])).rows
    expect(msgs).toEqual([{ authorRole: "system" }])
    expect(holder.notifications).toEqual([["dispute_auto_refunded", o.orderId]])
  })

  it("não reembolsa se o vendedor já respondeu ou o prazo ainda não passou", async () => {
    const respondeu = await createOrder({ status: "entregue" })
    await openDispute(respondeu.orderId, { sellerResponseDueAt: PAST, sellerResponded: true })
    const noPrazo = await createOrder({ status: "entregue" })
    await openDispute(noPrazo.orderId, { sellerResponseDueAt: FUTURE })

    expect(await sweepDisputeSla()).toBe(0)

    expect((await orderRow(respondeu.orderId)).status).toBe("em_disputa")
    expect((await orderRow(noPrazo.orderId)).status).toBe("em_disputa")
    expect(await wallet("buyer")).toEqual({ availableCents: 80_000, heldCents: 20_000 })
  })

  it("não mexe em disputa já decidida", async () => {
    const o = await createOrder({ status: "entregue" })
    const d = await openDispute(o.orderId, { sellerResponseDueAt: PAST, status: "resolvida_vendedor" })

    expect(await sweepDisputeSla()).toBe(0)
    expect((await disputeRow(d)).status).toBe("resolvida_vendedor")
    expect((await orderRow(o.orderId)).status).toBe("em_disputa")
  })

  it("rodar de novo não reembolsa duas vezes", async () => {
    const o = await createOrder({ status: "entregue" })
    await openDispute(o.orderId, { sellerResponseDueAt: PAST })

    await sweepDisputeSla()
    await sweepDisputeSla()

    expect(await wallet("buyer")).toEqual({ availableCents: 100_000, heldCents: 0 })
    expect(holder.notifications).toHaveLength(1)
  })

  it("depois de varrer, a conferência do dinheiro continua batendo", async () => {
    const o = await createOrder({ status: "entregue" })
    await openDispute(o.orderId, { sellerResponseDueAt: PAST })
    await sweepDisputeSla()

    expect((await runWalletReconciliation()).findings).toEqual([])
  })
})
