import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { splitOrderAmount } from "@/lib/money"

/**
 * Primeiros testes do dinheiro de verdade: `lib/wallet.ts` e `lib/reconcile.ts`
 * contra um Postgres em memória (PGlite) com as migrações reais. O `pool` do app é
 * trocado pelo do banco de teste — nada aqui toca o Neon.
 *
 * Os "fluxos" abaixo repetem a sequência das server actions (comprar, confirmar,
 * cancelar, disputar): a mesma ordem de transitionOrder → movimento de dinheiro.
 */

const holder = vi.hoisted(() => ({ pool: null as unknown as TestDb["pool"] }))

vi.mock("@/lib/db", () => ({
  db: {},
  pool: {
    query: (text: string, params?: unknown[]) => holder.pool.query(text, params),
    connect: () => holder.pool.connect(),
  },
}))

import {
  StateConflictError,
  creditAvailable,
  debitAvailable,
  lockWallet,
  moveToEscrow,
  refundEscrow,
  releaseEscrowToSeller,
  transitionOrder,
  withTransaction,
} from "@/lib/wallet"
import { runWalletReconciliation } from "@/lib/reconcile"

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
  holder.pool = db.pool
}, 60_000)

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  // Cada teste começa do zero; ordem respeita as chaves estrangeiras.
  await db.query(
    `TRUNCATE "wallet_transaction", "dispute_message", "dispute", "order", "product_variant", "product", "wallet", "user" RESTART IDENTITY CASCADE`,
  )
  // Pedidos 1–5 são a carga de demonstração antiga e a conferência os trata à parte
  // (LEGACY_SEED_ORDER_IDS em lib/reconcile.ts); pedidos de teste começam depois deles.
  await db.query(`SELECT setval(pg_get_serial_sequence('"order"', 'id'), 100)`)
  for (const id of ["buyer", "seller"]) {
    await db.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $1 || '@teste.dev')`, [id])
  }
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

async function wallet(userId: string) {
  const { rows } = await db.query(`SELECT "availableCents", "heldCents" FROM "wallet" WHERE "userId" = $1`, [userId])
  return rows[0] as { availableCents: number; heldCents: number } | undefined
}

async function ledger(userId: string) {
  const { rows } = await db.query(
    `SELECT "kind", "amountCents", "balanceAfterCents", "orderId" FROM "wallet_transaction" WHERE "userId" = $1 ORDER BY "id"`,
    [userId],
  )
  return rows as { kind: string; amountCents: number; balanceAfterCents: number; orderId: number | null }[]
}

async function orderStatus(orderId: number) {
  const { rows } = await db.query(`SELECT "status", "completedAt" FROM "order" WHERE "id" = $1`, [orderId])
  return rows[0] as { status: string; completedAt: Date | null }
}

async function deposit(userId: string, cents: number) {
  await withTransaction((c) => creditAvailable(c, userId, cents, "deposito", "Depósito de teste"))
}

/** Compra (mesma sequência de `purchase`): pedido + custódia na mesma transação. */
async function purchase(priceCents: number, buyerId = "buyer", sellerId = "seller") {
  return withTransaction(async (c) => {
    const { rows: p } = await c.query(
      `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ($1, 'p-' || gen_random_uuid()::text, 'Conta de teste', 'contas') RETURNING "id"`,
      [sellerId],
    )
    const { rows: v } = await c.query(
      `INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Item', $2, 1) RETURNING "id"`,
      [p[0].id, priceCents],
    )
    const { amountCents, feeCents, sellerNetCents } = splitOrderAmount(priceCents)
    const { rows: o } = await c.query(
      `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents")
       VALUES ($1, $2, $3, $4, 'Conta de teste', 'Item', $5, $6, $7) RETURNING "id"`,
      [buyerId, sellerId, p[0].id, v[0].id, amountCents, feeCents, sellerNetCents],
    )
    const orderId = o[0].id as number
    await moveToEscrow(c, buyerId, amountCents, "Compra de teste", orderId)
    return { orderId, amountCents, feeCents, sellerNetCents }
  })
}

async function deliver(orderId: number) {
  await db.query(`UPDATE "order" SET "status" = 'entregue', "deliveredAt" = now() WHERE "id" = $1`, [orderId])
}

/** Confirmação do comprador (mesma sequência de `confirmReceipt`). */
async function confirm(o: { orderId: number; amountCents: number; feeCents: number; sellerNetCents: number }) {
  await withTransaction(async (c) => {
    await transitionOrder(c, o.orderId, ["entregue"], "concluido", { completed: true })
    await releaseEscrowToSeller(c, {
      buyerId: "buyer",
      sellerId: "seller",
      amountCents: o.amountCents,
      feeCents: o.feeCents,
      sellerNetCents: o.sellerNetCents,
      orderId: o.orderId,
      description: "Venda de teste",
    })
  })
}

/** Cancelamento (mesma sequência de `cancelOrder`). */
async function cancel(o: { orderId: number; amountCents: number }) {
  await withTransaction(async (c) => {
    await transitionOrder(c, o.orderId, ["aguardando_entrega"], "cancelado", { completed: true })
    await refundEscrow(c, "buyer", o.amountCents, o.orderId, "Cancelamento de teste")
  })
}

/* ---------------------------------------------------------------------------
 * Primitivas
 * ------------------------------------------------------------------------ */

describe("crédito e débito", () => {
  it("depósito soma ao saldo e grava uma linha no extrato", async () => {
    await deposit("buyer", 10_000)
    expect(await wallet("buyer")).toEqual({ availableCents: 10_000, heldCents: 0 })
    expect(await ledger("buyer")).toEqual([
      { kind: "deposito", amountCents: 10_000, balanceAfterCents: 10_000, orderId: null },
    ])
  })

  it("saque debita e registra o valor negativo", async () => {
    await deposit("buyer", 10_000)
    await withTransaction((c) => debitAvailable(c, "buyer", 4_000, "saque", "Saque de teste"))
    expect(await wallet("buyer")).toEqual({ availableCents: 6_000, heldCents: 0 })
    expect((await ledger("buyer")).at(-1)).toMatchObject({ kind: "saque", amountCents: -4_000, balanceAfterCents: 6_000 })
  })

  it("saque maior que o saldo falha e não muda nada", async () => {
    await deposit("buyer", 1_000)
    await expect(
      withTransaction((c) => debitAvailable(c, "buyer", 1_001, "saque", "Saque grande")),
    ).rejects.toThrow("Saldo insuficiente")
    expect(await wallet("buyer")).toEqual({ availableCents: 1_000, heldCents: 0 })
    expect(await ledger("buyer")).toHaveLength(1)
  })

  it("lockWallet cria a carteira zerada quando ela ainda não existe", async () => {
    const w = await withTransaction((c) => lockWallet(c, "seller"))
    expect(w).toMatchObject({ userId: "seller", availableCents: 0, heldCents: 0 })
  })
})

describe("rollback", () => {
  it("erro no meio da transação desfaz tudo, inclusive o que já tinha sido gravado", async () => {
    await deposit("buyer", 5_000)

    await expect(
      withTransaction(async (c) => {
        await creditAvailable(c, "buyer", 2_000, "deposito", "Parte 1")
        throw new Error("falha depois do crédito")
      }),
    ).rejects.toThrow("falha depois do crédito")

    expect(await wallet("buyer")).toEqual({ availableCents: 5_000, heldCents: 0 })
    expect(await ledger("buyer")).toHaveLength(1)
  })

  it("o banco recusa saldo negativo mesmo se o código errar a conta", async () => {
    await deposit("buyer", 100)
    await expect(
      db.query(`UPDATE "wallet" SET "availableCents" = -1 WHERE "userId" = 'buyer'`),
    ).rejects.toThrow()
    await expect(
      db.query(`UPDATE "wallet" SET "heldCents" = -1 WHERE "userId" = 'buyer'`),
    ).rejects.toThrow()
  })
})

/* ---------------------------------------------------------------------------
 * Fluxos completos
 * ------------------------------------------------------------------------ */

describe("compra → entrega → confirmação", () => {
  it("o dinheiro vai do comprador para a custódia e, na confirmação, para o vendedor menos a taxa", async () => {
    await deposit("buyer", 20_000)
    const o = await purchase(10_000)

    expect(o).toMatchObject({ amountCents: 10_000, feeCents: 800, sellerNetCents: 9_200 })
    expect(await wallet("buyer")).toEqual({ availableCents: 10_000, heldCents: 10_000 })
    expect(await wallet("seller")).toBeUndefined() // vendedor ainda não recebeu nada

    await deliver(o.orderId)
    await confirm(o)

    expect(await wallet("buyer")).toEqual({ availableCents: 10_000, heldCents: 0 })
    expect(await wallet("seller")).toEqual({ availableCents: 9_200, heldCents: 0 })
    expect(await orderStatus(o.orderId)).toMatchObject({ status: "concluido" })
    expect((await orderStatus(o.orderId)).completedAt).not.toBeNull()
  })

  it("o extrato do vendedor soma exatamente o que ele recebeu (venda bruta e taxa separadas)", async () => {
    await deposit("buyer", 5_000)
    const o = await purchase(5_000)
    await deliver(o.orderId)
    await confirm(o)

    const entries = await ledger("seller")
    expect(entries.map((e) => [e.kind, e.amountCents])).toEqual([
      ["venda", 5_000],
      ["taxa", -400],
    ])
    expect(entries.reduce((sum, e) => sum + e.amountCents, 0)).toBe(4_600)
    expect(entries.at(-1)?.balanceAfterCents).toBe(4_600)
  })

  it("o comprador só tem uma linha de débito (custódia), sem lançar de novo na liberação", async () => {
    await deposit("buyer", 3_000)
    const o = await purchase(3_000)
    await deliver(o.orderId)
    await confirm(o)

    expect((await ledger("buyer")).map((e) => e.kind)).toEqual(["deposito", "custodia"])
  })

  it("compra sem saldo falha por inteiro: nem pedido, nem custódia", async () => {
    await deposit("buyer", 500)
    await expect(purchase(10_000)).rejects.toThrow("Saldo insuficiente")

    expect(await wallet("buyer")).toEqual({ availableCents: 500, heldCents: 0 })
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "order"`)
    expect(rows[0].n).toBe(0)
  })
})

describe("liquidar duas vezes (o bug que já aconteceu)", () => {
  it("confirmar o mesmo pedido duas vezes: a segunda é barrada e o vendedor recebe uma só vez", async () => {
    await deposit("buyer", 10_000)
    const o = await purchase(10_000)
    await deliver(o.orderId)

    await confirm(o)
    await expect(confirm(o)).rejects.toBeInstanceOf(StateConflictError)

    expect(await wallet("seller")).toEqual({ availableCents: 9_200, heldCents: 0 })
    expect((await ledger("seller")).filter((e) => e.kind === "venda")).toHaveLength(1)
  })

  it("mesmo pulando a trava de estado, liberar sem custódia suficiente é recusado", async () => {
    await deposit("buyer", 10_000)
    const o = await purchase(10_000)
    await deliver(o.orderId)
    await confirm(o)

    await expect(
      withTransaction((c) =>
        releaseEscrowToSeller(c, {
          buyerId: "buyer",
          sellerId: "seller",
          amountCents: o.amountCents,
          feeCents: o.feeCents,
          sellerNetCents: o.sellerNetCents,
          orderId: o.orderId,
          description: "Segunda liberação",
        }),
      ),
    ).rejects.toThrow("Custódia insuficiente")
    expect(await wallet("seller")).toEqual({ availableCents: 9_200, heldCents: 0 })
  })

  it("reembolsar duas vezes é recusado e o dinheiro volta uma só vez", async () => {
    await deposit("buyer", 10_000)
    const o = await purchase(10_000)

    await cancel(o)
    await expect(cancel(o)).rejects.toBeInstanceOf(StateConflictError)
    await expect(
      withTransaction((c) => refundEscrow(c, "buyer", o.amountCents, o.orderId, "Reembolso extra")),
    ).rejects.toThrow("Custódia insuficiente")

    expect(await wallet("buyer")).toEqual({ availableCents: 10_000, heldCents: 0 })
  })

  it("não dá para confirmar um pedido que ainda não foi entregue", async () => {
    await deposit("buyer", 1_000)
    const o = await purchase(1_000)
    await expect(confirm(o)).rejects.toBeInstanceOf(StateConflictError)
    expect(await wallet("buyer")).toEqual({ availableCents: 0, heldCents: 1_000 })
  })
})

describe("liberação com valores que não fecham", () => {
  it("bruto menos taxa diferente do líquido gravado é recusado", async () => {
    await deposit("buyer", 10_000)
    const o = await purchase(10_000)
    await deliver(o.orderId)

    await expect(
      withTransaction((c) =>
        releaseEscrowToSeller(c, {
          buyerId: "buyer",
          sellerId: "seller",
          amountCents: 10_000,
          feeCents: 800,
          sellerNetCents: 9_999,
          orderId: o.orderId,
          description: "Divergente",
        }),
      ),
    ).rejects.toThrow("Divergência")
    expect(await wallet("buyer")).toEqual({ availableCents: 0, heldCents: 10_000 })
  })

  it("pedido sem taxa não grava a linha de taxa", async () => {
    await deposit("buyer", 1_000)
    const o = await purchase(1_000)
    await deliver(o.orderId)
    await withTransaction(async (c) => {
      await transitionOrder(c, o.orderId, ["entregue"], "concluido", { completed: true })
      await releaseEscrowToSeller(c, {
        buyerId: "buyer",
        sellerId: "seller",
        amountCents: 1_000,
        feeCents: 0,
        sellerNetCents: 1_000,
        orderId: o.orderId,
        description: "Sem taxa",
      })
    })
    expect((await ledger("seller")).map((e) => e.kind)).toEqual(["venda"])
    expect(await wallet("seller")).toEqual({ availableCents: 1_000, heldCents: 0 })
  })
})

describe("cancelamento e reembolso", () => {
  it("cancelar antes da entrega devolve tudo ao comprador e não mexe no vendedor", async () => {
    await deposit("buyer", 10_000)
    const o = await purchase(7_000)
    await cancel(o)

    expect(await wallet("buyer")).toEqual({ availableCents: 10_000, heldCents: 0 })
    expect(await wallet("seller")).toBeUndefined()
    expect((await ledger("buyer")).map((e) => e.kind)).toEqual(["deposito", "custodia", "reembolso"])
    expect(await orderStatus(o.orderId)).toMatchObject({ status: "cancelado" })
  })

  it("só o valor daquele pedido sai da custódia quando há dois pedidos abertos", async () => {
    await deposit("buyer", 20_000)
    const a = await purchase(5_000)
    const b = await purchase(3_000)
    expect(await wallet("buyer")).toEqual({ availableCents: 12_000, heldCents: 8_000 })

    await cancel(a)
    expect(await wallet("buyer")).toEqual({ availableCents: 17_000, heldCents: 3_000 })
    expect((await orderStatus(b.orderId)).status).toBe("aguardando_entrega")
  })
})

describe("disputa", () => {
  async function openDispute(orderId: number) {
    await withTransaction((c) => transitionOrder(c, orderId, ["aguardando_entrega", "entregue"], "em_disputa"))
  }

  it("decisão a favor do comprador reembolsa a custódia", async () => {
    await deposit("buyer", 6_000)
    const o = await purchase(6_000)
    await deliver(o.orderId)
    await openDispute(o.orderId)

    await withTransaction(async (c) => {
      await transitionOrder(c, o.orderId, ["em_disputa"], "reembolsado", { completed: true })
      await refundEscrow(c, "buyer", o.amountCents, o.orderId, "Disputa a favor do comprador")
    })

    expect(await wallet("buyer")).toEqual({ availableCents: 6_000, heldCents: 0 })
    expect(await wallet("seller")).toBeUndefined()
  })

  it("decisão a favor do vendedor libera a custódia com a taxa", async () => {
    await deposit("buyer", 6_000)
    const o = await purchase(6_000)
    await deliver(o.orderId)
    await openDispute(o.orderId)

    await withTransaction(async (c) => {
      await transitionOrder(c, o.orderId, ["em_disputa"], "concluido", { completed: true })
      await releaseEscrowToSeller(c, {
        buyerId: "buyer",
        sellerId: "seller",
        amountCents: o.amountCents,
        feeCents: o.feeCents,
        sellerNetCents: o.sellerNetCents,
        orderId: o.orderId,
        description: "Disputa a favor do vendedor",
      })
    })

    expect(await wallet("buyer")).toEqual({ availableCents: 0, heldCents: 0 })
    expect(await wallet("seller")).toEqual({ availableCents: o.sellerNetCents, heldCents: 0 })
  })

  it("resolver uma disputa já resolvida é barrado", async () => {
    await deposit("buyer", 2_000)
    const o = await purchase(2_000)
    await deliver(o.orderId)
    await openDispute(o.orderId)
    await withTransaction(async (c) => {
      await transitionOrder(c, o.orderId, ["em_disputa"], "reembolsado", { completed: true })
      await refundEscrow(c, "buyer", o.amountCents, o.orderId, "Primeira decisão")
    })

    await expect(
      withTransaction((c) => transitionOrder(c, o.orderId, ["em_disputa"], "concluido", { completed: true })),
    ).rejects.toBeInstanceOf(StateConflictError)
  })
})

/* ---------------------------------------------------------------------------
 * Conferência (reconcile): a rede de segurança que roda a cada 15 minutos
 * ------------------------------------------------------------------------ */

describe("runWalletReconciliation", () => {
  it("um banco vazio e um ciclo completo de compra e venda batem em todas as conferências", async () => {
    expect((await runWalletReconciliation()).ok).toBe(true)

    await deposit("buyer", 30_000)
    const a = await purchase(10_000)
    await deliver(a.orderId)
    await confirm(a)
    const b = await purchase(5_000)
    await cancel(b)
    await purchase(2_000) // fica em custódia, pedido em andamento
    await withTransaction((c) => debitAvailable(c, "seller", 1_000, "saque", "Saque"))

    const report = await runWalletReconciliation()
    expect(report.findings).toEqual([])
    expect(report.ok).toBe(true)
    expect(report.totals.orders).toBe(3)
  })

  it("acusa saldo alterado à mão que não bate com o extrato", async () => {
    await deposit("buyer", 1_000)
    await db.query(`UPDATE "wallet" SET "availableCents" = 1500 WHERE "userId" = 'buyer'`)

    const report = await runWalletReconciliation()
    expect(report.ok).toBe(false)
    const checks = report.findings.map((f) => f.check)
    expect(checks).toContain("saldo_vs_extrato")
    expect(checks).toContain("conservacao_do_dinheiro")
  })

  it("acusa pedido pago duas vezes", async () => {
    await deposit("buyer", 5_000)
    const o = await purchase(5_000)
    await deliver(o.orderId)
    await confirm(o)
    // Segundo pagamento lançado direto no extrato, como um bug de código faria.
    await db.query(
      `INSERT INTO "wallet_transaction" ("userId", "orderId", "kind", "amountCents", "balanceAfterCents") VALUES ('seller', $1, 'venda', 100, 4700)`,
      [o.orderId],
    )

    const checks = (await runWalletReconciliation()).findings.map((f) => f.check)
    expect(checks).toContain("pedido_liquidado_duas_vezes")
  })

  it("acusa pedido concluído sem pagamento ao vendedor", async () => {
    await deposit("buyer", 5_000)
    const o = await purchase(5_000)
    await db.query(`UPDATE "order" SET "status" = 'concluido' WHERE "id" = $1`, [o.orderId])

    const checks = (await runWalletReconciliation()).findings.map((f) => f.check)
    expect(checks).toContain("pedido_concluido_sem_pagamento")
    expect(checks).toContain("custodia_vs_pedidos")
  })

  it("acusa taxa que não fecha com o líquido do pedido", async () => {
    await deposit("buyer", 5_000)
    const o = await purchase(5_000)
    await db.query(`UPDATE "order" SET "sellerNetCents" = "sellerNetCents" + 1 WHERE "id" = $1`, [o.orderId])

    const checks = (await runWalletReconciliation()).findings.map((f) => f.check)
    expect(checks).toContain("taxa_inconsistente")
  })
})
