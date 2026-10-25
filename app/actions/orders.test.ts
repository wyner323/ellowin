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
  lowStock: [] as number[],
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
  notifyLowStock: (variantId: number) => {
    holder.lowStock.push(variantId)
  },
}))

import { cancelOrder, confirmReceipt, markDelivered, postOrderMessage, purchase } from "@/app/actions/orders"
import {
  CHAT_FULL_MESSAGE,
  CHAT_RATE_MESSAGE,
  MAX_CHAT_MESSAGES_PER_HOUR,
  MAX_CHAT_MESSAGES_PER_THREAD,
} from "@/lib/chat-limits"
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
  holder.lowStock.length = 0
  holder.revalidated.length = 0
  await t.query(
    `TRUNCATE "auth_attempt", "wallet_transaction", "order_message", "dispute_message", "dispute", "order", "product_variant", "product", "wallet", "profile", "user" RESTART IDENTITY CASCADE`,
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
    autoReleaseAt: Date | null
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
    expect(holder.notifications).toEqual([["order_created", result.orderId, { automatic: false }]])
    expect(holder.revalidated).toEqual(["/pedidos", "/carteira"])
  })

  it("congela o prazo de entrega do anúncio e NÃO começa a contar a liberação automática (só conta da entrega)", async () => {
    const { variantId } = await addListing({ deliveryTime: "Até 24 horas" })
    const orderId = await buy(variantId)

    // Calculado no banco (tudo em UTC) para não depender do fuso da máquina que roda o teste.
    const { dueMs } = await one<{ dueMs: number }>(
      `SELECT extract(epoch FROM ("deliveryDueAt" - (now() AT TIME ZONE 'UTC'))) * 1000 AS "dueMs"
         FROM "order" WHERE "id" = $1`,
      [orderId],
    )

    const day = 24 * 60 * 60 * 1000
    expect(Number(dueMs)).toBeGreaterThan(day - 60_000)
    expect(Number(dueMs)).toBeLessThanOrEqual(day)
    expect((await orderRow(orderId)).autoReleaseAt).toBeNull()
  })

  it("anúncio de entrega automática sem item no estoque não vende: o pedido nunca nasce sem entrega e sem prazo de reembolso", async () => {
    // Antes da entrega automática de verdade, esse pedido nascia aguardando entrega e SEM prazo (deliveryDueAt nulo),
    // então o reembolso por atraso nunca disparava. A compra com item está em app/actions/auto-delivery.test.ts.
    const { variantId } = await addListing({ deliveryType: "automatica", deliveryTime: "Imediata (entrega automática)" })
    holder.userId = "buyer"
    expect(await purchase(variantId, 10_000)).toMatchObject({ ok: false, error: "Item esgotado." })
    expect(await orderCount()).toBe(0)
    expect((await wallet("buyer")).heldCents).toBe(0)
  })

  it("depois de comprar, pede o aviso de estoque baixo do item comprado (e só se a compra deu certo)", async () => {
    const { variantId } = await addListing({ stock: 3 })
    await buy(variantId)
    expect(holder.lowStock).toEqual([variantId])
    holder.lowStock.length = 0
    holder.userId = "buyer"
    expect(await purchase(999_999, 10_000)).toMatchObject({ ok: false })
    expect(holder.lowStock).toEqual([])
  })

  it("conta de jogo: a procedência declarada na hora da compra fica registrada no pedido, mesmo se o anúncio mudar depois", async () => {
    const { productId, variantId } = await addListing()
    await t.query(`UPDATE "product" SET "categorySlug" = 'contas', "accountOrigin" = 'comprado_com_recuperacao' WHERE "id" = $1`, [productId])
    const orderId = await buy(variantId)
    await t.query(`UPDATE "product" SET "accountOrigin" = 'criador_sem_recuperacao' WHERE "id" = $1`, [productId]) // o vendedor edita depois
    const notes = (await t.query(`SELECT "authorRole", "body" FROM "order_message" WHERE "orderId" = $1`, [orderId])).rows as { authorRole: string; body: string }[]
    expect(notes).toHaveLength(1)
    expect(notes[0].authorRole).toBe("system")
    expect(notes[0].body).toContain("Comprei de outro jogador/loja — ainda tenho dados de recuperação")
    expect(notes[0].body).toContain("antes de confirmar o recebimento")
    expect(notes[0].body).not.toContain("Sou o criador")
  })

  it("só conta de jogo registra procedência: outra categoria, ou conta sem procedência, não grava mensagem", async () => {
    const outra = await addListing()
    await t.query(`UPDATE "product" SET "categorySlug" = 'gift-cards', "accountOrigin" = 'criador_sem_recuperacao' WHERE "id" = $1`, [outra.productId])
    const semOrigem = await addListing()
    for (const variantId of [outra.variantId, semOrigem.variantId]) {
      const orderId = await buy(variantId)
      expect((await t.query(`SELECT 1 FROM "order_message" WHERE "orderId" = $1`, [orderId])).rows).toEqual([])
    }
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

  it("erro inesperado do banco não vaza para o comprador: mensagem genérica, nada gravado", async () => {
    const { variantId } = await addListing({ priceCents: 10_000, stock: 3 })
    // faz o INSERT do pedido falhar com um erro cru do Postgres (nome de tabela e constraint na mensagem)
    await t.query(`ALTER TABLE "order" ADD CONSTRAINT "zz_forca_erro" CHECK (false) NOT VALID`)
    try {
      holder.userId = "buyer"
      const result = await purchase(variantId, 10_000)
      expect(result).toEqual({ ok: false, error: "Não foi possível concluir a compra. Tente novamente." })
      expect(JSON.stringify(result)).not.toContain("zz_forca_erro")
    } finally {
      await t.query(`ALTER TABLE "order" DROP CONSTRAINT "zz_forca_erro"`)
    }
    expect(await orderCount()).toBe(0)
    expect(await stockOf(variantId)).toBe(3)
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
 * postOrderMessage (chat do pedido)
 * ------------------------------------------------------------------------ */

describe("postOrderMessage", () => {
  it("só comprador e vendedor do pedido escrevem; texto vazio ou longo é recusado", async () => {
    const { variantId } = await addListing()
    const orderId = await buy(variantId)

    holder.userId = "stranger"
    expect(await postOrderMessage({ orderId, body: "Intrometido" })).toEqual({ ok: false, error: "Pedido não encontrado." })
    holder.userId = "buyer"
    expect(await postOrderMessage({ orderId, body: " a " })).toMatchObject({ ok: false, field: "body" })
    expect(await postOrderMessage({ orderId, body: "x".repeat(2001) })).toMatchObject({ ok: false, field: "body" })
    expect(await postOrderMessage({ orderId, body: "Oi, quando entrega?" })).toEqual({ ok: true })
    holder.userId = "seller"
    expect(await postOrderMessage({ orderId, body: "Em instantes." })).toEqual({ ok: true })
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM "order_message"`)).n).toBe(2)
  })

  it("freia quem manda mensagens sem parar (por hora, por pessoa) e fecha a conversa que passou do teto", async () => {
    const { variantId } = await addListing()
    const orderId = await buy(variantId)

    holder.userId = "buyer"
    for (let i = 0; i < MAX_CHAT_MESSAGES_PER_HOUR; i++)
      expect(await postOrderMessage({ orderId, body: `mensagem ${i}` }), `mensagem ${i}`).toEqual({ ok: true })
    expect(await postOrderMessage({ orderId, body: "uma a mais" })).toEqual({ ok: false, error: CHAT_RATE_MESSAGE })
    holder.userId = "seller"
    expect(await postOrderMessage({ orderId, body: "Em instantes." })).toEqual({ ok: true })

    await t.query(
      `INSERT INTO "order_message" ("orderId", "authorId", "authorRole", "body")
       SELECT $1, 'buyer', 'buyer', 'enchendo ' || g FROM generate_series(1, $2) g`,
      [orderId, MAX_CHAT_MESSAGES_PER_THREAD],
    )
    await t.query(`TRUNCATE "auth_attempt"`)
    expect(await postOrderMessage({ orderId, body: "não cabe mais" })).toEqual({ ok: false, error: CHAT_FULL_MESSAGE })
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

  it("a liberação automática conta da ENTREGA: mesmo entregue muito depois da compra, o comprador tem os dias completos", async () => {
    const { variantId } = await addListing()
    const orderId = await buy(variantId)
    // compra "antiga": 10 dias atrás, com o prazo de entrega já estourado
    await one(`UPDATE "order" SET "createdAt" = now() - interval '10 days', "deliveryDueAt" = now() - interval '9 days' WHERE "id" = $1 RETURNING "id"`, [orderId])

    await deliverAs(orderId)

    const day = 24 * 60 * 60 * 1000
    const o = await orderRow(orderId)
    const fromDelivery = o.autoReleaseAt!.getTime() - o.deliveredAt!.getTime()
    expect(fromDelivery).toBe(AUTO_RELEASE_DAYS * day)
    expect(o.autoReleaseAt!.getTime() - Date.now()).toBeGreaterThan(AUTO_RELEASE_DAYS * day - 60_000)
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

  it("recusa dados que imitam dado cifrado (o marcador enc:v1: travaria a página do pedido)", async () => {
    const { variantId } = await addListing()
    const orderId = await buy(variantId)
    holder.userId = "seller"
    for (const payload of ["enc:v1:a:b:c", "  enc:v1:qualquer coisa  "]) {
      expect(await markDelivered({ orderId, payload })).toMatchObject({ ok: false, field: "payload" })
    }
    const row = await orderRow(orderId)
    expect(row.status).toBe("aguardando_entrega")
    expect(row.deliveryPayload).toBeNull()
    // texto comum que só CONTÉM o marcador no meio continua valendo
    expect(await markDelivered({ orderId, payload: "login: x / nota: enc:v1:" })).toMatchObject({ ok: true })
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

describe("freios contra segurar o estoque de graça", () => {
  const seed = (key: string, n: number) =>
    t.query(`INSERT INTO "auth_attempt" ("key") SELECT $1 FROM generate_series(1, $2)`, [key, n])

  it("no máximo 10 pedidos aguardando entrega por comprador; entregar ou cancelar libera vaga", async () => {
    const { variantId } = await addListing({ stock: 30, priceCents: 100 })
    holder.userId = "buyer"
    const ids: number[] = []
    for (let i = 0; i < 10; i++) {
      const r = await purchase(variantId, 100)
      expect(r.ok, r.error).toBe(true)
      ids.push(r.orderId as number)
    }
    const blocked = await purchase(variantId, 100)
    expect(blocked).toMatchObject({ ok: false })
    expect(blocked.error).toContain("aguardando entrega")
    expect(await stockOf(variantId)).toBe(20) // a compra recusada não mexeu no estoque

    expect((await cancelOrder(ids[0])).ok).toBe(true)
    expect((await purchase(variantId, 100)).ok).toBe(true)
  })

  it("no máximo 20 compras por hora, mesmo cancelando para abrir vaga", async () => {
    const { variantId } = await addListing({ stock: 5, priceCents: 100 })
    await seed("purchase:buyer", 20)
    holder.userId = "buyer"
    expect(await purchase(variantId, 100)).toMatchObject({ ok: false, error: expect.stringContaining("Muitas compras") })
    expect(await stockOf(variantId)).toBe(5)
    expect(await orderCount()).toBe(0)
  })

  it("o comprador cancela no máximo 10 vezes por hora; o vendedor não é limitado", async () => {
    const { variantId } = await addListing({ stock: 3 })
    const a = await buy(variantId)
    const b = await buy(variantId)
    await seed("cancel:buyer", 10)

    holder.userId = "buyer"
    expect(await cancelOrder(a)).toMatchObject({ ok: false, error: expect.stringContaining("Muitos cancelamentos") })
    expect((await orderRow(a)).status).toBe("aguardando_entrega")
    expect(await stockOf(variantId)).toBe(1)

    holder.userId = "seller"
    expect((await cancelOrder(b)).ok).toBe(true)
  })
})

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
