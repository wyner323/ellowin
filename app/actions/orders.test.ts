import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { AUTO_RELEASE_DAYS, splitOrderAmount } from "@/lib/money"

/**
 * Server actions de pedido (comprar, entregar, confirmar, cancelar) de ponta a
 * ponta contra um Postgres em memória com as migrações reais. A sessão, o envio
 * de email e o cache do Next são simulados; o resto — `lib/session.ts` (email
 * confirmado, cadastro completo), a transação, o escrow e o extrato — é o código
 * de verdade.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
  notifications: [] as [string, number, unknown?][],
  revalidated: [] as string[],
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
      getSession: async () => (holder.userId ? { user: { id: holder.userId } } : null),
    },
  },
}))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/server", () => ({ after: () => {} }))
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    holder.revalidated.push(path)
  },
}))
vi.mock("@/lib/notify", () => ({
  notifyOrder: (kind: string, orderId: number, extra?: unknown) => {
    holder.notifications.push([kind, orderId, extra])
  },
}))

import { cancelOrder, confirmReceipt, markDelivered, purchase } from "@/app/actions/orders"
import { creditAvailable, withTransaction } from "@/lib/wallet"
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
  holder.userId = null
  holder.notifications.length = 0
  holder.revalidated.length = 0
  await t.query(
    `TRUNCATE "wallet_transaction", "order_message", "dispute_message", "dispute", "order", "product_variant", "product", "wallet", "profile", "user" RESTART IDENTITY CASCADE`,
  )
  // Pedidos 1–5 são a carga de demonstração antiga para a conferência (lib/reconcile.ts).
  await t.query(`SELECT setval(pg_get_serial_sequence('"order"', 'id'), 100)`)

  await addUser("buyer")
  await addUser("seller")
  await addUser("stranger")
  await addUser("unverified", { emailVerified: false })
  await addUser("noprofile", { profile: false })

  await withTransaction((c) => creditAvailable(c, "buyer", 100_000, "deposito", "Depósito de teste"))
  await withTransaction((c) => creditAvailable(c, "unverified", 100_000, "deposito", "Depósito de teste"))
  await withTransaction((c) => creditAvailable(c, "noprofile", 100_000, "deposito", "Depósito de teste"))
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

async function addUser(id: string, { emailVerified = true, profile = true } = {}) {
  await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES ($1, $1, $1 || '@teste.dev', $2)`, [
    id,
    emailVerified,
  ])
  if (profile) {
    await t.query(
      `INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "birthDate") VALUES ($1, $1, '52998224725', '11999999999', '1990-01-01')`,
      [id],
    )
  }
}

async function addListing(
  opts: {
    priceCents?: number
    stock?: number
    deliveryType?: string
    deliveryTime?: string
    productStatus?: string
    variantActive?: boolean
    sellerId?: string
  } = {},
) {
  const { rows: p } = await t.query(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "deliveryType", "deliveryTime", "status")
     VALUES ($1, 'p-' || gen_random_uuid()::text, 'Conta Valorant', 'contas', $2, $3, $4) RETURNING "id"`,
    [opts.sellerId ?? "seller", opts.deliveryType ?? "manual", opts.deliveryTime ?? "Até 24 horas", opts.productStatus ?? "ativo"],
  )
  const { rows: v } = await t.query(
    `INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock", "active") VALUES ($1, 'Conta completa', $2, $3, $4) RETURNING "id"`,
    [p[0].id, opts.priceCents ?? 10_000, opts.stock ?? 1, opts.variantActive ?? true],
  )
  return { productId: p[0].id as number, variantId: v[0].id as number }
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

const stockOf = async (variantId: number) =>
  (await one<{ stock: number }>(`SELECT "stock" FROM "product_variant" WHERE "id" = $1`, [variantId])).stock

const orderCount = async () => (await one<{ n: number }>(`SELECT count(*)::int AS n FROM "order"`)).n

const orderRow = (id: number) =>
  one<{
    status: string
    amountCents: number
    feeCents: number
    sellerNetCents: number
    buyerId: string
    sellerId: string
    autoReleaseAt: Date
    deliveryDueAt: Date | null
    deliveryPayload: string | null
    deliveredAt: Date | null
  }>(`SELECT * FROM "order" WHERE "id" = $1`, [id])

/** Compra feita pelo comprador padrão; devolve o id do pedido. */
async function buy(variantId: number, price = 10_000) {
  holder.userId = "buyer"
  const result = await purchase(variantId, price)
  expect(result.ok, result.error).toBe(true)
  return result.orderId as number
}

async function deliverAs(orderId: number, sellerId = "seller") {
  holder.userId = sellerId
  const result = await markDelivered({ orderId, payload: "login: teste / senha: 1234" })
  expect(result.ok, result.error).toBe(true)
}

/* ---------------------------------------------------------------------------
 * purchase
 * ------------------------------------------------------------------------ */

describe("purchase", () => {
  it("cria o pedido com o preço do BANCO, põe o dinheiro em custódia e baixa o estoque", async () => {
    const { variantId } = await addListing({ priceCents: 10_000, stock: 3 })
    holder.userId = "buyer"

    const result = await purchase(variantId, 10_000)

    expect(result).toMatchObject({ ok: true })
    const o = await orderRow(result.orderId!)
    expect(o).toMatchObject({
      status: "aguardando_entrega",
      amountCents: 10_000,
      feeCents: 800,
      sellerNetCents: 9_200,
      buyerId: "buyer",
      sellerId: "seller",
    })
    expect(await wallet("buyer")).toEqual({ availableCents: 90_000, heldCents: 10_000 })
    expect(await wallet("seller")).toBeUndefined()
    expect(await stockOf(variantId)).toBe(2)
    expect(holder.notifications).toEqual([["order_created", result.orderId, undefined]])
    expect(holder.revalidated).toEqual(["/pedidos", "/carteira"])
  })

  it("congela os prazos: liberação automática em 7 dias da compra e entrega no prazo do anúncio", async () => {
    const { variantId } = await addListing({ deliveryTime: "Até 24 horas" })
    const orderId = await buy(variantId)

    // Calculado no banco (tudo em UTC) para não depender do fuso da máquina que roda o teste.
    const { releaseMs, dueMs } = await one<{ releaseMs: number; dueMs: number }>(
      `SELECT extract(epoch FROM ("autoReleaseAt" - (now() AT TIME ZONE 'UTC'))) * 1000 AS "releaseMs",
              extract(epoch FROM ("deliveryDueAt" - (now() AT TIME ZONE 'UTC'))) * 1000 AS "dueMs"
         FROM "order" WHERE "id" = $1`,
      [orderId],
    )

    const day = 24 * 60 * 60 * 1000
    expect(Number(releaseMs)).toBeGreaterThan(AUTO_RELEASE_DAYS * day - 60_000)
    expect(Number(releaseMs)).toBeLessThanOrEqual(AUTO_RELEASE_DAYS * day)
    expect(Number(dueMs)).toBeGreaterThan(day - 60_000)
    expect(Number(dueMs)).toBeLessThanOrEqual(day)
  })

  it("entrega automática não tem prazo de entrega (nada para o reembolso por atraso disparar)", async () => {
    const { variantId } = await addListing({ deliveryType: "automatica", deliveryTime: "Imediata (entrega automática)" })
    const orderId = await buy(variantId)
    expect((await orderRow(orderId)).deliveryDueAt).toBeNull()
  })

  it("exige estar logado", async () => {
    const { variantId } = await addListing()
    holder.userId = null
    await expect(purchase(variantId, 10_000)).rejects.toThrow("Não autenticado")
    expect(await orderCount()).toBe(0)
  })

  it("exige e-mail confirmado e cadastro completo, sem criar nada", async () => {
    const { variantId } = await addListing()

    holder.userId = "unverified"
    expect(await purchase(variantId, 10_000)).toMatchObject({ ok: false, field: "email" })

    holder.userId = "noprofile"
    expect(await purchase(variantId, 10_000)).toMatchObject({ ok: false, field: "profile" })

    expect(await orderCount()).toBe(0)
    expect(await stockOf(variantId)).toBe(1)
    expect(await wallet("unverified")).toEqual({ availableCents: 100_000, heldCents: 0 })
  })

  it("recusa preço inválido vindo do cliente", async () => {
    const { variantId } = await addListing()
    holder.userId = "buyer"
    for (const bad of [0, -5, 1.5, Number.NaN]) {
      expect(await purchase(variantId, bad)).toMatchObject({ ok: false })
    }
    expect(await orderCount()).toBe(0)
  })

  it("preço que mudou depois que o comprador viu a tela: recusa e avisa para recarregar", async () => {
    const { variantId } = await addListing({ priceCents: 10_000 })
    await t.query(`UPDATE "product_variant" SET "priceCents" = 15000 WHERE "id" = $1`, [variantId])
    holder.userId = "buyer"

    const result = await purchase(variantId, 10_000)

    expect(result).toMatchObject({ ok: false, field: "price" })
    expect(result.error).toContain("150,00")
    expect(await orderCount()).toBe(0)
    expect(await wallet("buyer")).toEqual({ availableCents: 100_000, heldCents: 0 })
  })

  it("não deixa pagar menos do que o preço real mandando um valor menor", async () => {
    const { variantId } = await addListing({ priceCents: 10_000 })
    holder.userId = "buyer"
    expect(await purchase(variantId, 1)).toMatchObject({ ok: false, field: "price" })
    expect(await orderCount()).toBe(0)
  })

  it("recusa o próprio anúncio, item esgotado, pausado, desativado e inexistente", async () => {
    const own = await addListing({ sellerId: "buyer" })
    const soldOut = await addListing({ stock: 0 })
    const paused = await addListing({ productStatus: "pausado" })
    const inactive = await addListing({ variantActive: false })
    holder.userId = "buyer"

    expect((await purchase(own.variantId, 10_000)).error).toContain("próprio anúncio")
    expect((await purchase(soldOut.variantId, 10_000)).error).toContain("esgotado")
    expect((await purchase(paused.variantId, 10_000)).error).toContain("não está mais disponível")
    expect((await purchase(inactive.variantId, 10_000)).error).toContain("não está mais disponível")
    expect((await purchase(999_999, 10_000)).error).toContain("não encontrado")

    expect(await orderCount()).toBe(0)
    expect(await wallet("buyer")).toEqual({ availableCents: 100_000, heldCents: 0 })
  })

  it("saldo insuficiente desfaz tudo: sem pedido, sem custódia e o estoque não é baixado", async () => {
    const { variantId } = await addListing({ priceCents: 500_000 })
    holder.userId = "buyer"

    const result = await purchase(variantId, 500_000)

    expect(result).toMatchObject({ ok: false, error: "Saldo insuficiente" })
    expect(await orderCount()).toBe(0)
    expect(await stockOf(variantId)).toBe(1)
    expect(await wallet("buyer")).toEqual({ availableCents: 100_000, heldCents: 0 })
    expect(holder.notifications).toEqual([])
  })

  it("o último item só pode ser comprado uma vez", async () => {
    const { variantId } = await addListing({ stock: 1 })
    await addUser("buyer2")
    await withTransaction((c) => creditAvailable(c, "buyer2", 100_000, "deposito", "Depósito de teste"))

    await buy(variantId)
    holder.userId = "buyer2"
    expect((await purchase(variantId, 10_000)).error).toContain("esgotado")

    expect(await orderCount()).toBe(1)
    expect(await stockOf(variantId)).toBe(0)
    expect(await wallet("buyer2")).toEqual({ availableCents: 100_000, heldCents: 0 })
  })
})

/* ---------------------------------------------------------------------------
 * markDelivered
 * ------------------------------------------------------------------------ */

describe("markDelivered", () => {
  it("o vendedor registra a entrega: status, data e dados guardados", async () => {
    const { variantId } = await addListing()
    const orderId = await buy(variantId)

    await deliverAs(orderId)

    const o = await orderRow(orderId)
    expect(o.status).toBe("entregue")
    expect(o.deliveredAt).not.toBeNull()
    expect(o.deliveryPayload).toContain("senha: 1234")
    expect(holder.notifications.at(-1)).toEqual(["order_delivered", orderId, undefined])
  })

  it("quem não é o vendedor do pedido não encontra o pedido (comprador, estranho)", async () => {
    const { variantId } = await addListing()
    const orderId = await buy(variantId)

    for (const who of ["buyer", "stranger"]) {
      holder.userId = who
      expect(await markDelivered({ orderId, payload: "dados da entrega" })).toEqual({
        ok: false,
        error: "Pedido não encontrado.",
      })
    }
    expect((await orderRow(orderId)).status).toBe("aguardando_entrega")
  })

  it("valida o tamanho dos dados e não entrega duas vezes", async () => {
    const { variantId } = await addListing()
    const orderId = await buy(variantId)
    holder.userId = "seller"

    expect(await markDelivered({ orderId, payload: "  a  " })).toMatchObject({ ok: false, field: "payload" })
    expect(await markDelivered({ orderId, payload: "x".repeat(5_001) })).toMatchObject({ ok: false, field: "payload" })
    expect((await orderRow(orderId)).status).toBe("aguardando_entrega")

    await deliverAs(orderId)
    expect(await markDelivered({ orderId, payload: "outros dados" })).toMatchObject({ ok: false })
  })

  it("não ressuscita pedido cancelado", async () => {
    const { variantId } = await addListing()
    const orderId = await buy(variantId)
    holder.userId = "buyer"
    await cancelOrder(orderId)

    holder.userId = "seller"
    expect(await markDelivered({ orderId, payload: "dados da entrega" })).toMatchObject({ ok: false })
    expect((await orderRow(orderId)).status).toBe("cancelado")
  })
})

/* ---------------------------------------------------------------------------
 * confirmReceipt
 * ------------------------------------------------------------------------ */

describe("confirmReceipt", () => {
  it("libera ao vendedor o valor menos a taxa e soma uma venda ao anúncio", async () => {
    const { variantId, productId } = await addListing({ priceCents: 10_000 })
    const orderId = await buy(variantId)
    await deliverAs(orderId)

    holder.userId = "buyer"
    const result = await confirmReceipt(orderId)

    expect(result).toMatchObject({ ok: true })
    expect((await orderRow(orderId)).status).toBe("concluido")
    expect(await wallet("buyer")).toEqual({ availableCents: 90_000, heldCents: 0 })
    expect(await wallet("seller")).toEqual({ availableCents: 9_200, heldCents: 0 })
    expect((await one<{ salesCount: number }>(`SELECT "salesCount" FROM "product" WHERE "id" = $1`, [productId])).salesCount).toBe(1)
    expect(holder.notifications.at(-1)).toEqual(["order_completed", orderId, undefined])
  })

  it("só o comprador confirma: o vendedor e um estranho não encontram o pedido", async () => {
    const { variantId } = await addListing()
    const orderId = await buy(variantId)
    await deliverAs(orderId)

    for (const who of ["seller", "stranger"]) {
      holder.userId = who
      expect(await confirmReceipt(orderId)).toEqual({ ok: false, error: "Pedido não encontrado." })
    }
    expect((await orderRow(orderId)).status).toBe("entregue")
    expect(await wallet("seller")).toBeUndefined()
  })

  it("não confirma o que ainda não foi entregue", async () => {
    const { variantId } = await addListing()
    const orderId = await buy(variantId)
    holder.userId = "buyer"

    expect(await confirmReceipt(orderId)).toMatchObject({ ok: false })
    expect(await wallet("buyer")).toEqual({ availableCents: 90_000, heldCents: 10_000 })
  })

  it("confirmar duas vezes paga uma só vez", async () => {
    const { variantId } = await addListing()
    const orderId = await buy(variantId)
    await deliverAs(orderId)
    holder.userId = "buyer"

    expect((await confirmReceipt(orderId)).ok).toBe(true)
    expect((await confirmReceipt(orderId)).ok).toBe(false)

    expect(await wallet("seller")).toEqual({ availableCents: 9_200, heldCents: 0 })
    expect(holder.notifications.filter(([k]) => k === "order_completed")).toHaveLength(1)
  })
})

/* ---------------------------------------------------------------------------
 * cancelOrder
 * ------------------------------------------------------------------------ */

describe("cancelOrder", () => {
  it("o comprador cancela antes da entrega: dinheiro e estoque voltam", async () => {
    const { variantId } = await addListing({ stock: 2 })
    const orderId = await buy(variantId)
    expect(await stockOf(variantId)).toBe(1)

    holder.userId = "buyer"
    const result = await cancelOrder(orderId)

    expect(result).toMatchObject({ ok: true })
    expect((await orderRow(orderId)).status).toBe("cancelado")
    expect(await wallet("buyer")).toEqual({ availableCents: 100_000, heldCents: 0 })
    expect(await stockOf(variantId)).toBe(2)
    expect(holder.notifications.at(-1)).toEqual(["order_cancelled", orderId, { cancelledBy: "comprador" }])
  })

  it("o vendedor também pode cancelar, e o aviso diz quem cancelou", async () => {
    const { variantId } = await addListing()
    const orderId = await buy(variantId)

    holder.userId = "seller"
    expect((await cancelOrder(orderId)).ok).toBe(true)

    expect(await wallet("buyer")).toEqual({ availableCents: 100_000, heldCents: 0 })
    expect(holder.notifications.at(-1)).toEqual(["order_cancelled", orderId, { cancelledBy: "vendedor" }])
  })

  it("quem não participa do pedido não cancela", async () => {
    const { variantId } = await addListing()
    const orderId = await buy(variantId)

    holder.userId = "stranger"
    expect(await cancelOrder(orderId)).toEqual({ ok: false, error: "Você não participa deste pedido." })
    expect((await orderRow(orderId)).status).toBe("aguardando_entrega")
    expect(await wallet("buyer")).toEqual({ availableCents: 90_000, heldCents: 10_000 })
  })

  it("não cancela depois da entrega nem duas vezes", async () => {
    const entregue = await addListing()
    const orderA = await buy(entregue.variantId)
    await deliverAs(orderA)
    holder.userId = "buyer"
    expect(await cancelOrder(orderA)).toMatchObject({ ok: false })
    expect((await orderRow(orderA)).status).toBe("entregue")

    const outra = await addListing({ stock: 1 })
    const orderB = await buy(outra.variantId)
    holder.userId = "buyer"
    expect((await cancelOrder(orderB)).ok).toBe(true)
    expect((await cancelOrder(orderB)).ok).toBe(false)
    expect(await stockOf(outra.variantId)).toBe(1) // o estoque volta uma vez só
  })

  it("pedido inexistente", async () => {
    holder.userId = "buyer"
    expect(await cancelOrder(424_242)).toEqual({ ok: false, error: "Pedido não encontrado." })
  })
})

/* ---------------------------------------------------------------------------
 * O dinheiro continua batendo depois de tudo isso
 * ------------------------------------------------------------------------ */

describe("conferência do dinheiro depois das ações", () => {
  it("uma sequência de compras, entregas, confirmações e cancelamentos não deixa nada fora do lugar", async () => {
    const a = await addListing({ priceCents: 10_000, stock: 1 })
    const b = await addListing({ priceCents: 4_990, stock: 1 })
    const c = await addListing({ priceCents: 2_500, stock: 1 })
    const d = await addListing({ priceCents: 7_777, stock: 1 })

    const orderA = await buy(a.variantId, 10_000)
    await deliverAs(orderA)
    holder.userId = "buyer"
    await confirmReceipt(orderA)

    const orderB = await buy(b.variantId, 4_990)
    holder.userId = "seller"
    await cancelOrder(orderB)

    const orderC = await buy(c.variantId, 2_500)
    await deliverAs(orderC) // entregue e aguardando confirmação

    await buy(d.variantId, 7_777) // aguardando entrega

    const report = await runWalletReconciliation()
    expect(report.findings).toEqual([])
    expect(report.totals.orders).toBe(4)
    expect(splitOrderAmount(4_990).feeCents).toBe(399) // arredondamento de centavos
  })
})
