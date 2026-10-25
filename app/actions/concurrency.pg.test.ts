import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createRealPgDb, realPgUrl, type RealPgDb } from "@/lib/test-db-pg"

/**
 * Concorrência de verdade, num Postgres real (várias conexões ao mesmo tempo): é aqui que se prova que o `FOR UPDATE`, o
 * `transitionOrder` e os tetos dentro de transação seguram o dinheiro e o estoque quando duas pessoas agem juntas. O banco em
 * memória dos outros testes tem UMA conexão e não consegue reproduzir isso. Sem `PG_TEST_URL` o arquivo inteiro se pula (a CI
 * define a variável e sobe um serviço Postgres). Cada teste repete a disputa em várias rodadas para dar chance de a corrida
 * aparecer, e termina conferindo que o dinheiro da plataforma bate (a mesma conferência de produção).
 */

const holder = vi.hoisted(() => ({
  db: null as unknown,
  pool: null as unknown,
  who: null as unknown as { run: <T>(userId: string | null, fn: () => T) => T; get: () => string | null },
}))

vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db
  },
  get pool() {
    return holder.pool
  },
}))
// A pessoa que age vem do contexto da CHAMADA (não de uma variável global), para duas chamadas simultâneas serem de pessoas diferentes.
vi.mock("@/lib/auth", async () => {
  const { AsyncLocalStorage: Als } = await import("node:async_hooks")
  const store = new Als<string | null>()
  holder.who = { run: (userId, fn) => store.run(userId, fn), get: () => store.getStore() ?? null }
  return { auth: { api: { getSession: async () => (holder.who.get() ? { user: { id: holder.who.get() } } : null) } } }
})
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/server", () => ({ after: () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/notify", () => ({ notifyOrder: () => {}, notifyLowStock: () => {}, notifyPriceChange: () => {}, notificationsLive: () => false }))

import { addFunds, requestWithdrawal } from "@/app/actions/wallet"
import { addStock } from "@/app/actions/delivery-stock"
import { cancelOrder, confirmReceipt, markDelivered, purchase } from "@/app/actions/orders"
import { runWalletReconciliation } from "@/lib/reconcile"
import { decryptField } from "@/lib/secret-box"
import { sweepAutoRelease, sweepDeliveryDeadline } from "@/lib/sla-sweeps"
import { creditAvailable, withTransaction } from "@/lib/wallet"

// Em cada chamada, "quem age" é o contexto: `as("ana", () => purchase(...))`.
const as = <T>(userId: string | null, fn: () => T): T => holder.who.run(userId, fn)

const URL_ = realPgUrl()
const ROUNDS = 12
const KEY = Buffer.alloc(32, 9).toString("base64")

let d: RealPgDb
const q = (text: string, params?: unknown[]) => d.query(text, params)
const one = async <T = Record<string, unknown>>(text: string, params?: unknown[]) => (await q(text, params)).rows[0] as T

describe.skipIf(!URL_)("concorrência em Postgres real", () => {
  beforeAll(async () => {
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", KEY)
    d = await createRealPgDb(URL_!)
    holder.db = d.db
    holder.pool = d.pool
  }, 120_000)

  afterAll(async () => {
    vi.unstubAllEnvs()
    await d?.close()
  })

  beforeEach(async () => {
    await q(
      `TRUNCATE "auth_attempt", "delivery_stock_item", "wallet_transaction", "order_message", "dispute", "order", "product_variant", "product", "wallet", "seller_application", "profile", "user" RESTART IDENTITY CASCADE`,
    )
    // Pedidos 1–5 são a carga de demonstração antiga para a conferência (lib/reconcile.ts).
    await q(`SELECT setval(pg_get_serial_sequence('"order"', 'id'), 100)`)
    await addUser("seller", { seller: true, pix: true })
  })

  async function addUser(id: string, opts: { seller?: boolean; pix?: boolean; funds?: number } = {}) {
    await q(`INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES ($1, $1, $1 || '@teste.dev', true)`, [id])
    await q(`INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "birthDate") VALUES ($1, $1, '52998224725', '11999999999', '1990-01-01')`, [id])
    if (opts.seller) {
      await q(`INSERT INTO "seller_application" ("userId", "status", "storeSlug", "pixKey", "pixKeyType") VALUES ($1, 'aprovado', $1 || '-store', $2, 'cpf')`, [id, opts.pix ? "52998224725" : null])
    }
    if (opts.funds) await withTransaction((c) => creditAvailable(c, id, opts.funds!, "deposito", "Depósito de teste"))
  }

  async function listing(opts: { stock?: number; deliveryType?: string; priceCents?: number; category?: string } = {}) {
    const p = await one<{ id: number }>(
      `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "deliveryType", "deliveryTime") VALUES ('seller', 'p-' || gen_random_uuid()::text, 'Gift card', $1, $2, $3) RETURNING "id"`,
      [opts.category ?? "contas", opts.deliveryType ?? "manual", opts.deliveryType === "automatica" ? "Imediata (entrega automática)" : "Até 24 horas"],
    )
    const v = await one<{ id: number }>(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'R$ 50', $2, $3) RETURNING "id"`, [p.id, opts.priceCents ?? 10_000, opts.stock ?? 1])
    return { productId: p.id, variantId: v.id }
  }

  const stockOf = async (variantId: number) => (await one<{ stock: number }>(`SELECT "stock" FROM "product_variant" WHERE "id" = $1`, [variantId])).stock
  const ordersOf = async (variantId: number) => (await q(`SELECT "id", "buyerId", "status" FROM "order" WHERE "variantId" = $1 ORDER BY "id"`, [variantId])).rows as { id: number; buyerId: string; status: string }[]

  /** A conferência de produção: o dinheiro da plataforma tem de fechar depois de qualquer disputa. */
  async function expectMoneyBalanced() {
    const report = await runWalletReconciliation()
    expect(report.findings.map((f) => `${f.check}: ${JSON.stringify(f.rows)}`)).toEqual([])
  }

  it("duas pessoas disputam a ÚLTIMA unidade: só uma leva, a outra recebe 'Item esgotado', e ninguém é cobrado à toa", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await addUser(`a${round}`, { funds: 50_000 })
      await addUser(`b${round}`, { funds: 50_000 })
      const { variantId } = await listing({ stock: 1 })

      const results = await Promise.all([
        as(`a${round}`, () => purchase(variantId, 10_000)),
        as(`b${round}`, () => purchase(variantId, 10_000)),
      ])

      expect(results.filter((r) => r.ok), `rodada ${round}: ${JSON.stringify(results)}`).toHaveLength(1)
      expect(results.find((r) => !r.ok)?.error).toBe("Item esgotado.")
      expect(await stockOf(variantId)).toBe(0)
      const orders = await ordersOf(variantId)
      expect(orders).toHaveLength(1)
      // só quem levou teve o dinheiro retido; o outro continua com o saldo inteiro
      for (const who of [`a${round}`, `b${round}`]) {
        const w = await one<{ availableCents: number; heldCents: number }>(`SELECT "availableCents", "heldCents" FROM "wallet" WHERE "userId" = $1`, [who])
        expect(w.heldCents).toBe(orders[0].buyerId === who ? 10_000 : 0)
        expect(w.availableCents + w.heldCents).toBe(50_000)
      }
    }
    await expectMoneyBalanced()
  }, 120_000)

  it("a mesma pessoa clica duas vezes na última unidade: um pedido só", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await addUser(`c${round}`, { funds: 50_000 })
      const { variantId } = await listing({ stock: 1 })
      const results = await Promise.all([as(`c${round}`, () => purchase(variantId, 10_000)), as(`c${round}`, () => purchase(variantId, 10_000))])
      expect(results.filter((r) => r.ok), `rodada ${round}`).toHaveLength(1)
      expect(await ordersOf(variantId)).toHaveLength(1)
      expect(await stockOf(variantId)).toBe(0)
    }
    await expectMoneyBalanced()
  }, 120_000)

  it("8 compradores para 3 unidades: exatamente 3 compras, estoque zero, nunca negativo", async () => {
    for (let i = 0; i < 8; i++) await addUser(`m${i}`, { funds: 50_000 })
    const { variantId } = await listing({ stock: 3 })
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => as(`m${i}`, () => purchase(variantId, 10_000))))
    expect(results.filter((r) => r.ok)).toHaveLength(3)
    expect(await ordersOf(variantId)).toHaveLength(3)
    expect(await stockOf(variantId)).toBe(0)
    await expectMoneyBalanced()
  }, 120_000)

  it("confirmar o recebimento duas vezes ao mesmo tempo (ou junto com a liberação automática) paga o vendedor UMA vez", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await addUser(`p${round}`, { funds: 50_000 })
      const { variantId } = await listing({ stock: 5 })
      const bought = await as(`p${round}`, () => purchase(variantId, 10_000))
      expect(bought.ok).toBe(true)
      const orderId = bought.orderId!
      expect((await as("seller", () => markDelivered({ orderId, payload: "login: abc senha: 123" }))).ok).toBe(true)
      // prazo de conferência vencido: a varredura também tenta liberar
      await q(`UPDATE "order" SET "autoReleaseAt" = now() - interval '1 hour' WHERE "id" = $1`, [orderId])

      const results = await Promise.all([
        as(`p${round}`, () => confirmReceipt(orderId)),
        as(`p${round}`, () => confirmReceipt(orderId)),
        sweepAutoRelease(),
      ])
      const confirmations = results.slice(0, 2) as { ok: boolean }[]
      expect(confirmations.filter((r) => r.ok).length, `rodada ${round}`).toBeLessThanOrEqual(1)

      const paid = await one<{ n: number }>(`SELECT count(*)::int AS n FROM "wallet_transaction" WHERE "orderId" = $1 AND "kind" = 'venda'`, [orderId])
      expect(paid.n, `rodada ${round}: pagamentos`).toBe(1)
      expect((await one<{ status: string }>(`SELECT "status" FROM "order" WHERE "id" = $1`, [orderId])).status).toBe("concluido")
    }
    await expectMoneyBalanced()
  }, 120_000)

  it("comprador e vendedor cancelam ao mesmo tempo: um reembolso só e o estoque volta UMA vez", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await addUser(`k${round}`, { funds: 50_000 })
      const { variantId } = await listing({ stock: 1 })
      const orderId = (await as(`k${round}`, () => purchase(variantId, 10_000))).orderId!
      expect(await stockOf(variantId)).toBe(0)

      const results = await Promise.all([as(`k${round}`, () => cancelOrder(orderId)), as("seller", () => cancelOrder(orderId))])
      expect(results.filter((r) => r.ok), `rodada ${round}: ${JSON.stringify(results)}`).toHaveLength(1)
      expect(await stockOf(variantId)).toBe(1)
      const refunds = await one<{ n: number }>(`SELECT count(*)::int AS n FROM "wallet_transaction" WHERE "orderId" = $1 AND "kind" = 'reembolso'`, [orderId])
      expect(refunds.n).toBe(1)
      const w = await one<{ availableCents: number; heldCents: number }>(`SELECT "availableCents", "heldCents" FROM "wallet" WHERE "userId" = $1`, [`k${round}`])
      expect(w).toEqual({ availableCents: 50_000, heldCents: 0 })
    }
    await expectMoneyBalanced()
  }, 120_000)

  it("prazo de entrega vencido: a varredura e o cancelamento ao mesmo tempo reembolsam UMA vez (sem travar um ao outro)", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await addUser(`s${round}`, { funds: 50_000 })
      const { variantId } = await listing({ stock: 1 })
      const orderId = (await as(`s${round}`, () => purchase(variantId, 10_000))).orderId!
      await q(`UPDATE "order" SET "deliveryDueAt" = now() - interval '1 hour' WHERE "id" = $1`, [orderId])

      await Promise.all([
        sweepDeliveryDeadline(),
        sweepDeliveryDeadline(),
        as(`s${round}`, () => cancelOrder(orderId)),
        as("seller", () => cancelOrder(orderId)),
      ])

      expect(["reembolsado", "cancelado"], `rodada ${round}`).toContain((await one<{ status: string }>(`SELECT "status" FROM "order" WHERE "id" = $1`, [orderId])).status)
      expect(await stockOf(variantId), `rodada ${round}: estoque`).toBe(1)
      const refunds = await one<{ n: number }>(`SELECT count(*)::int AS n FROM "wallet_transaction" WHERE "orderId" = $1 AND "kind" = 'reembolso'`, [orderId])
      expect(refunds.n, `rodada ${round}: reembolsos`).toBe(1)
      const w = await one<{ availableCents: number; heldCents: number }>(`SELECT "availableCents", "heldCents" FROM "wallet" WHERE "userId" = $1`, [`s${round}`])
      expect(w).toEqual({ availableCents: 50_000, heldCents: 0 })
    }
    await expectMoneyBalanced()
  }, 120_000)

  it("entregar e cancelar ao mesmo tempo: ou um ou outro vence, e o dinheiro fecha", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await addUser(`e${round}`, { funds: 50_000 })
      const { variantId } = await listing({ stock: 1 })
      const orderId = (await as(`e${round}`, () => purchase(variantId, 10_000))).orderId!
      await Promise.all([
        as("seller", () => markDelivered({ orderId, payload: "login: abc senha: 123" })),
        as(`e${round}`, () => cancelOrder(orderId)),
      ])
      const { status } = await one<{ status: string }>(`SELECT "status" FROM "order" WHERE "id" = $1`, [orderId])
      expect(["entregue", "cancelado"], `rodada ${round}`).toContain(status)
    }
    await expectMoneyBalanced()
  }, 120_000)

  it("depósitos simultâneos não furam o teto de 24 horas (R$ 10.000)", async () => {
    await addUser("rico")
    const results = await Promise.all(Array.from({ length: 6 }, () => as("rico", () => addFunds("5000,00"))))
    expect(results.filter((r) => r.ok)).toHaveLength(2)
    const total = await one<{ total: number }>(`SELECT coalesce(sum("amountCents"), 0)::int AS total FROM "wallet_transaction" WHERE "userId" = 'rico' AND "kind" = 'deposito'`)
    expect(total.total).toBe(1_000_000)
  }, 60_000)

  it("dois saques ao mesmo tempo com saldo para um só: o saldo nunca fica negativo", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await addUser(`s${round}`, { seller: true, pix: true, funds: 10_000 })
      const results = await Promise.all([as(`s${round}`, () => requestWithdrawal("80,00")), as(`s${round}`, () => requestWithdrawal("80,00"))])
      expect(results.filter((r) => r.ok), `rodada ${round}: ${JSON.stringify(results)}`).toHaveLength(1)
      const w = await one<{ availableCents: number }>(`SELECT "availableCents" FROM "wallet" WHERE "userId" = $1`, [`s${round}`])
      expect(w.availableCents).toBe(2_000)
    }
    await expectMoneyBalanced()
  }, 60_000)

  describe("entrega automática", () => {
    async function stockItems(variantId: number, n: number) {
      const codes = Array.from({ length: n }, (_, i) => `GIFT-${variantId}-${String(i).padStart(4, "0")}-XYZ`)
      const r = await as("seller", () => addStock(variantId, codes.join("\n")))
      expect(r.ok, r.error).toBe(true)
      return codes
    }

    it("6 compradores para 3 itens: 3 entregas, cada um com um item DIFERENTE, nenhum item entregue duas vezes", async () => {
      for (let i = 0; i < 6; i++) await addUser(`g${i}`, { funds: 50_000 })
      const { variantId } = await listing({ stock: 0, deliveryType: "automatica", category: "gift-cards" })
      const codes = await stockItems(variantId, 3)

      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => as(`g${i}`, () => purchase(variantId, 10_000))))
      expect(results.filter((r) => r.ok), JSON.stringify(results.map((r) => r.error))).toHaveLength(3)
      expect(results.filter((r) => !r.ok).every((r) => r.error === "Item esgotado.")).toBe(true)

      const delivered = (await q(`SELECT "id", "deliveryPayload" FROM "order" WHERE "variantId" = $1 AND "status" = 'entregue'`, [variantId])).rows as { id: number; deliveryPayload: string }[]
      const payloads = delivered.map((o) => decryptField(o.deliveryPayload, `order:${o.id}`))
      expect(new Set(payloads).size).toBe(3)
      expect([...payloads].sort()).toEqual([...codes].sort())
      expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM "delivery_stock_item" WHERE "orderId" IS NOT NULL`)).n).toBe(3)
      expect(await stockOf(variantId)).toBe(0)
      await expectMoneyBalanced()
    }, 120_000)

    it("repor o estoque enquanto compram: o estoque do anúncio é sempre igual aos itens disponíveis", async () => {
      for (let round = 0; round < ROUNDS; round++) {
        await addUser(`h${round}`, { funds: 50_000 })
        await addUser(`i${round}`, { funds: 50_000 })
        const { variantId } = await listing({ stock: 0, deliveryType: "automatica", category: "gift-cards" })
        await stockItems(variantId, 2)
        const more = Array.from({ length: 3 }, (_, i) => `NOVO-${round}-${variantId}-${i}-ABCDEF`).join("\n")
        await Promise.all([
          as("seller", () => addStock(variantId, more)),
          as(`h${round}`, () => purchase(variantId, 10_000)),
          as(`i${round}`, () => purchase(variantId, 10_000)),
        ])
        const available = (await one<{ n: number }>(`SELECT count(*)::int AS n FROM "delivery_stock_item" WHERE "variantId" = $1 AND "orderId" IS NULL`, [variantId])).n
        expect(await stockOf(variantId), `rodada ${round}`).toBe(available)
      }
      await expectMoneyBalanced()
    }, 120_000)
  })
})
