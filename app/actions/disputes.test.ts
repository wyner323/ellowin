import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Server actions de disputa (abrir, conversar, assumir e decidir) contra um
 * Postgres em memória com as migrações reais. A sessão, os emails e o cache do
 * Next são simulados; `lib/session.ts`, `lib/roles.ts`, a transação, o escrow e o
 * extrato são o código de verdade.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
  notifications: [] as [string, number, unknown?][],
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
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/notify", () => ({
  notifyOrder: (kind: string, orderId: number, extra?: unknown) => {
    holder.notifications.push([kind, orderId, extra])
  },
}))
vi.mock("@sentry/nextjs", () => ({ captureException: () => {} }))

import {
  claimDispute,
  fetchDisputeMessages,
  openDispute,
  postDisputeMessage,
  resolveDispute,
} from "@/app/actions/disputes"
import { cancelOrder, confirmReceipt, markDelivered, purchase } from "@/app/actions/orders"
import {
  CHAT_FULL_MESSAGE,
  CHAT_RATE_MESSAGE,
  MAX_CHAT_MESSAGES_PER_HOUR,
  MAX_CHAT_MESSAGES_PER_THREAD,
} from "@/lib/chat-limits"
import { sweepDisputeSla } from "@/lib/sla-sweeps"
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
  await t.query(
    `TRUNCATE "auth_attempt", "seller_account_flag", "wallet_transaction", "order_message", "dispute_message", "dispute", "order", "product_variant", "product", "wallet", "profile", "user" RESTART IDENTITY CASCADE`,
  )
  // Pedidos 1–5 são a carga de demonstração antiga para a conferência (lib/reconcile.ts).
  await t.query(`SELECT setval(pg_get_serial_sequence('"order"', 'id'), 100)`)

  await addUser("buyer")
  await addUser("seller")
  await addUser("stranger")
  await addUser("mod", "moderator")
  await withTransaction((c) => creditAvailable(c, "buyer", 100_000, "deposito", "Depósito de teste"))
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

async function addUser(id: string, role = "user") {
  await t.query(
    `INSERT INTO "user" ("id", "name", "email", "emailVerified", "role") VALUES ($1, $1, $1 || '@teste.dev', true, $2)`,
    [id, role],
  )
  await t.query(
    `INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "birthDate") VALUES ($1, $1, '52998224725', '11999999999', '1990-01-01')`,
    [id],
  )
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

const orderStatus = async (id: number) => (await one<{ status: string }>(`SELECT "status" FROM "order" WHERE "id" = $1`, [id])).status

const disputeRow = (id: number) =>
  one<{ status: string; resolution: string | null; moderatorId: string | null; sellerFirstResponseAt: Date | null; resolvedAt: Date | null }>(
    `SELECT "status", "resolution", "moderatorId", "sellerFirstResponseAt", "resolvedAt" FROM "dispute" WHERE "id" = $1`,
    [id],
  )

const messages = async (disputeId: number) =>
  (await t.query(`SELECT "authorRole", "body", "internal" FROM "dispute_message" WHERE "disputeId" = $1 ORDER BY "id"`, [disputeId])).rows as {
    authorRole: string
    body: string
    internal: boolean
  }[]

const PROBLEMA = "O vendedor entregou uma conta diferente da que foi anunciada."

/** Pedido comprado (e, opcionalmente, entregue) pelo comprador padrão. */
async function createOrder({ delivered = false, priceCents = 10_000 } = {}) {
  const { rows: p } = await t.query(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('seller', 'p-' || gen_random_uuid()::text, 'Conta Valorant', 'contas') RETURNING "id"`,
  )
  const { rows: v } = await t.query(
    `INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Conta completa', $2, 1) RETURNING "id"`,
    [p[0].id, priceCents],
  )
  holder.userId = "buyer"
  const bought = await purchase(v[0].id as number, priceCents)
  expect(bought.ok, bought.error).toBe(true)
  const orderId = bought.orderId as number
  if (delivered) {
    holder.userId = "seller"
    expect((await markDelivered({ orderId, payload: "login: teste / senha: 1234" })).ok).toBe(true)
  }
  holder.userId = "buyer"
  return { orderId, productId: p[0].id as number }
}

async function openAsBuyer(orderId: number) {
  holder.userId = "buyer"
  const result = await openDispute({ orderId, reason: "diferente", description: PROBLEMA })
  expect(result.ok, result.error).toBe(true)
  return result.disputeId as number
}

/* ---------------------------------------------------------------------------
 * openDispute
 * ------------------------------------------------------------------------ */

describe("openDispute", () => {
  it("o comprador abre: pedido vai para disputa, o dinheiro continua em custódia e o histórico começa", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)

    expect(await orderStatus(orderId)).toBe("em_disputa")
    expect(await disputeRow(disputeId)).toMatchObject({ status: "aberta", resolution: null })
    expect(await wallet("buyer")).toEqual({ availableCents: 90_000, heldCents: 10_000 })
    expect(await wallet("seller")).toBeUndefined()
    expect((await messages(disputeId)).map((m) => m.authorRole)).toEqual(["system", "buyer"])
    expect(holder.notifications.at(-1)).toEqual(["dispute_opened", orderId, undefined])
  })

  it("grava os três prazos de SLA a partir de agora", async () => {
    const { orderId } = await createOrder()
    const disputeId = await openAsBuyer(orderId)

    const d = await one<{ first: number; seller: number; resolution: number }>(
      `SELECT extract(epoch FROM ("firstContactDueAt" - (now() AT TIME ZONE 'UTC'))) AS first,
              extract(epoch FROM ("sellerResponseDueAt" - (now() AT TIME ZONE 'UTC'))) AS seller,
              extract(epoch FROM ("resolutionDueAt" - (now() AT TIME ZONE 'UTC'))) AS resolution
         FROM "dispute" WHERE "id" = $1`,
      [disputeId],
    )
    // Em horas úteis: no mínimo o prazo corrido, e o contato do suporte vem antes do resto.
    expect(Number(d.first)).toBeGreaterThan(23 * 3600)
    expect(Number(d.first)).toBeLessThan(Number(d.seller))
    expect(Number(d.seller)).toBeGreaterThan(47 * 3600)
    expect(Number(d.resolution)).toBeGreaterThan(47 * 3600)
  })

  it("abre antes da entrega também", async () => {
    const { orderId } = await createOrder({ delivered: false })
    await openAsBuyer(orderId)
    expect(await orderStatus(orderId)).toBe("em_disputa")
  })

  it("só o comprador do pedido abre: vendedor e estranho não encontram o pedido", async () => {
    const { orderId } = await createOrder({ delivered: true })
    for (const who of ["seller", "stranger", "mod"]) {
      holder.userId = who
      expect(await openDispute({ orderId, reason: "diferente", description: PROBLEMA })).toEqual({
        ok: false,
        error: "Pedido não encontrado.",
      })
    }
    expect(await orderStatus(orderId)).toBe("entregue")
  })

  it("exige estar logado", async () => {
    const { orderId } = await createOrder()
    holder.userId = null
    await expect(openDispute({ orderId, reason: "diferente", description: PROBLEMA })).rejects.toThrow("Não autenticado")
  })

  it("valida motivo e descrição", async () => {
    const { orderId } = await createOrder()
    holder.userId = "buyer"
    expect(await openDispute({ orderId, reason: "inventado", description: PROBLEMA })).toMatchObject({ ok: false, field: "reason" })
    expect(await openDispute({ orderId, reason: "diferente", description: "curto" })).toMatchObject({ ok: false, field: "description" })
    expect(await openDispute({ orderId, reason: "diferente", description: "x".repeat(2_001) })).toMatchObject({ ok: false, field: "description" })
    expect(await orderStatus(orderId)).toBe("aguardando_entrega")
  })

  it("não abre disputa de pedido concluído, cancelado ou que já tem disputa", async () => {
    const concluido = await createOrder({ delivered: true })
    holder.userId = "buyer"
    await confirmReceipt(concluido.orderId)
    expect((await openDispute({ orderId: concluido.orderId, reason: "diferente", description: PROBLEMA })).ok).toBe(false)

    const cancelado = await createOrder()
    holder.userId = "buyer"
    await cancelOrder(cancelado.orderId)
    expect((await openDispute({ orderId: cancelado.orderId, reason: "diferente", description: PROBLEMA })).ok).toBe(false)

    const comDisputa = await createOrder({ delivered: true })
    await openAsBuyer(comDisputa.orderId)
    expect((await openDispute({ orderId: comDisputa.orderId, reason: "diferente", description: PROBLEMA })).ok).toBe(false)
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM "dispute"`)).n).toBe(1)
  })

  it("com a disputa aberta o comprador não consegue confirmar o recebimento (nem pagar o vendedor por fora)", async () => {
    const { orderId } = await createOrder({ delivered: true })
    await openAsBuyer(orderId)

    holder.userId = "buyer"
    expect((await confirmReceipt(orderId)).ok).toBe(false)
    expect((await cancelOrder(orderId)).ok).toBe(false)
    expect(await wallet("seller")).toBeUndefined()
    expect(await wallet("buyer")).toEqual({ availableCents: 90_000, heldCents: 10_000 })
  })
})

/* ---------------------------------------------------------------------------
 * postDisputeMessage / fetchDisputeMessages
 * ------------------------------------------------------------------------ */

describe("chat da disputa", () => {
  it("a primeira mensagem do vendedor desarma o reembolso automático por SLA; a do comprador não", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)

    holder.userId = "buyer"
    expect((await postDisputeMessage({ disputeId, body: "Aguardo uma resposta." })).ok).toBe(true)
    expect((await disputeRow(disputeId)).sellerFirstResponseAt).toBeNull()

    holder.userId = "seller"
    expect((await postDisputeMessage({ disputeId, body: "Vou verificar a conta agora." })).ok).toBe(true)
    expect((await disputeRow(disputeId)).sellerFirstResponseAt).not.toBeNull()
  })

  it("vendedor que respondeu não é reembolsado automaticamente, mesmo com o prazo vencido", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)
    holder.userId = "seller"
    await postDisputeMessage({ disputeId, body: "Vou verificar a conta agora." })
    await t.query(`UPDATE "dispute" SET "sellerResponseDueAt" = now() - interval '1 hour' WHERE "id" = $1`, [disputeId])

    expect(await sweepDisputeSla()).toBe(0)
    expect(await orderStatus(orderId)).toBe("em_disputa")
  })

  it("vendedor que não respondeu é reembolsado pela varredura quando o prazo vence", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)
    await t.query(`UPDATE "dispute" SET "sellerResponseDueAt" = now() - interval '1 hour' WHERE "id" = $1`, [disputeId])

    expect(await sweepDisputeSla()).toBe(1)
    expect(await wallet("buyer")).toEqual({ availableCents: 100_000, heldCents: 0 })
    expect((await disputeRow(disputeId)).status).toBe("resolvida_comprador")
  })

  it("freia quem manda mensagens sem parar (por hora) e fecha a conversa que passou do teto; a moderação não é limitada", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)

    holder.userId = "buyer"
    for (let i = 0; i < MAX_CHAT_MESSAGES_PER_HOUR; i++)
      expect((await postDisputeMessage({ disputeId, body: `mensagem ${i}` })).ok, `mensagem ${i}`).toBe(true)
    expect(await postDisputeMessage({ disputeId, body: "uma a mais" })).toEqual({ ok: false, error: CHAT_RATE_MESSAGE })
    // o teto é por pessoa: a outra parte continua falando
    holder.userId = "seller"
    expect((await postDisputeMessage({ disputeId, body: "Vou verificar a conta agora." })).ok).toBe(true)

    // conversa já grande (500 mensagens): partes são barradas, moderação não
    await t.query(
      `INSERT INTO "dispute_message" ("disputeId", "authorId", "authorRole", "body")
       SELECT $1, 'buyer', 'buyer', 'enchendo ' || g FROM generate_series(1, $2) g`,
      [disputeId, MAX_CHAT_MESSAGES_PER_THREAD],
    )
    await t.query(`TRUNCATE "auth_attempt"`)
    expect(await postDisputeMessage({ disputeId, body: "não cabe mais" })).toEqual({ ok: false, error: CHAT_FULL_MESSAGE })
    holder.userId = "mod"
    expect((await postDisputeMessage({ disputeId, body: "Olá, vou analisar o caso." })).ok).toBe(true)
  })

  it("quem não participa não escreve nem lê; a moderação sim", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)

    holder.userId = "stranger"
    expect(await postDisputeMessage({ disputeId, body: "Intrometido" })).toEqual({ ok: false, error: "Disputa não encontrada." })
    expect(await fetchDisputeMessages(disputeId)).toEqual({ ok: false, messages: [] })

    holder.userId = "mod"
    expect((await postDisputeMessage({ disputeId, body: "Olá, vou analisar o caso." })).ok).toBe(true)
  })

  it("nota interna só vale vinda da moderação e não aparece para comprador nem vendedor", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)

    holder.userId = "mod"
    await postDisputeMessage({ disputeId, body: "Nota: comprador já abriu outros casos.", internal: true })
    holder.userId = "buyer"
    await postDisputeMessage({ disputeId, body: "Tentando esconder isto.", internal: true })

    const all = await messages(disputeId)
    expect(all.find((m) => m.body.startsWith("Nota:"))?.internal).toBe(true)
    expect(all.find((m) => m.body.startsWith("Tentando"))?.internal).toBe(false)

    for (const who of ["buyer", "seller"]) {
      holder.userId = who
      const fetched = await fetchDisputeMessages(disputeId)
      expect(fetched.ok).toBe(true)
      expect(JSON.stringify(fetched.messages)).not.toContain("outros casos")
    }
    holder.userId = "mod"
    expect(JSON.stringify((await fetchDisputeMessages(disputeId)).messages)).toContain("outros casos")
  })

  it("a primeira resposta pública da moderação move o caso para análise e registra quem atendeu", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)

    holder.userId = "mod"
    await postDisputeMessage({ disputeId, body: "Olá, vou analisar o caso." })

    expect(await disputeRow(disputeId)).toMatchObject({ status: "em_analise", moderatorId: "mod" })
  })

  it("valida o tamanho e recusa mensagem em disputa encerrada", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)

    holder.userId = "buyer"
    expect(await postDisputeMessage({ disputeId, body: "a" })).toMatchObject({ ok: false, field: "body" })
    expect(await postDisputeMessage({ disputeId, body: "x".repeat(2_001) })).toMatchObject({ ok: false, field: "body" })

    holder.userId = "mod"
    await resolveDispute({ disputeId, outcome: "comprador", note: "Conta diferente do anúncio." })
    holder.userId = "buyer"
    expect(await postDisputeMessage({ disputeId, body: "Obrigado pela decisão." })).toEqual({
      ok: false,
      error: "Esta disputa já foi encerrada.",
    })
  })
})

/* ---------------------------------------------------------------------------
 * claimDispute
 * ------------------------------------------------------------------------ */

describe("claimDispute", () => {
  it("moderador que é parte do pedido não assume a própria disputa (e outro moderador continua podendo)", async () => {
    await addUser("mod2", "moderator")
    await withTransaction((c) => creditAvailable(c, "mod", 50_000, "deposito", "Depósito de teste"))
    const { rows: p } = await t.query(
      `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('seller', 'p-' || gen_random_uuid()::text, 'Conta', 'contas') RETURNING "id"`,
    )
    const { rows: v } = await t.query(
      `INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Item', 5000, 1) RETURNING "id"`,
      [p[0].id],
    )
    holder.userId = "mod"
    const bought = await purchase(v[0].id as number, 5_000)
    await openDispute({ orderId: bought.orderId!, reason: "diferente", description: PROBLEMA })
    const disputeId = (await one<{ id: number }>(`SELECT "id" FROM "dispute" WHERE "orderId" = $1`, [bought.orderId])).id

    const result = await claimDispute(disputeId)
    expect(result).toMatchObject({ ok: false })
    expect(result.error).toContain("parte deste pedido")
    expect(await disputeRow(disputeId)).toMatchObject({ status: "aberta", moderatorId: null })

    holder.userId = "mod2"
    expect((await claimDispute(disputeId)).ok).toBe(true)
    expect(await disputeRow(disputeId)).toMatchObject({ status: "em_analise", moderatorId: "mod2" })
  })

  it("disputa inexistente", async () => {
    holder.userId = "mod"
    expect(await claimDispute(99_999)).toMatchObject({ ok: false, error: "Disputa não encontrada." })
  })

  it("só a moderação assume o caso", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)

    holder.userId = "buyer"
    expect(await claimDispute(disputeId)).toEqual({ ok: false, error: "Acesso restrito à moderação." })
    expect((await disputeRow(disputeId)).status).toBe("aberta")

    holder.userId = "mod"
    expect((await claimDispute(disputeId)).ok).toBe(true)
    expect(await disputeRow(disputeId)).toMatchObject({ status: "em_analise", moderatorId: "mod" })
  })
})

/* ---------------------------------------------------------------------------
 * resolveDispute
 * ------------------------------------------------------------------------ */

describe("resolveDispute", () => {
  it("a favor do comprador: devolve a custódia, o vendedor não recebe nada e o chat registra a decisão", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)

    holder.userId = "mod"
    const result = await resolveDispute({ disputeId, outcome: "comprador", note: "Conta diferente do anúncio." })

    expect(result).toMatchObject({ ok: true })
    expect(await orderStatus(orderId)).toBe("reembolsado")
    expect(await wallet("buyer")).toEqual({ availableCents: 100_000, heldCents: 0 })
    expect(await wallet("seller")).toBeUndefined()
    expect(await disputeRow(disputeId)).toMatchObject({ status: "resolvida_comprador", moderatorId: "mod" })
    expect((await messages(disputeId)).at(-1)).toMatchObject({ authorRole: "system" })
    expect(holder.notifications.at(-1)).toEqual(["dispute_resolved", orderId, { outcome: "comprador" }])
  })

  it("recusa uma decisão que não seja comprador/vendedor (valor inesperado nunca libera o dinheiro)", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)

    holder.userId = "mod"
    const result = await resolveDispute({ disputeId, outcome: "qualquer" as never, note: "Decisão com valor inválido." })

    expect(result).toEqual({ ok: false, error: "Decisão inválida." })
    expect(await orderStatus(orderId)).toBe("em_disputa")
    expect(await wallet("seller")).toBeUndefined()
  })

  it("a favor do vendedor: libera o valor menos a taxa e soma uma venda ao anúncio", async () => {
    const { orderId, productId } = await createOrder({ delivered: true, priceCents: 10_000 })
    const disputeId = await openAsBuyer(orderId)

    holder.userId = "mod"
    const result = await resolveDispute({ disputeId, outcome: "vendedor", note: "A conta estava como anunciada." })

    expect(result).toMatchObject({ ok: true })
    expect(await orderStatus(orderId)).toBe("concluido")
    expect(await wallet("buyer")).toEqual({ availableCents: 90_000, heldCents: 0 })
    expect(await wallet("seller")).toEqual({ availableCents: 9_200, heldCents: 0 })
    expect((await one<{ salesCount: number }>(`SELECT "salesCount" FROM "product" WHERE "id" = $1`, [productId])).salesCount).toBe(1)
    expect((await disputeRow(disputeId)).status).toBe("resolvida_vendedor")
  })

  it("só a moderação decide: comprador, vendedor e estranho são barrados", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)

    for (const who of ["buyer", "seller", "stranger"]) {
      holder.userId = who
      expect(await resolveDispute({ disputeId, outcome: "comprador", note: "Quero meu dinheiro de volta." })).toEqual({
        ok: false,
        error: "Acesso restrito à moderação.",
      })
    }
    expect(await orderStatus(orderId)).toBe("em_disputa")
    expect(await wallet("buyer")).toEqual({ availableCents: 90_000, heldCents: 10_000 })
  })

  it("moderador que é parte do pedido não decide a própria disputa", async () => {
    // O moderador compra e abre a disputa — não pode ser quem a decide.
    await withTransaction((c) => creditAvailable(c, "mod", 50_000, "deposito", "Depósito de teste"))
    const { rows: p } = await t.query(
      `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('seller', 'p-' || gen_random_uuid()::text, 'Conta', 'contas') RETURNING "id"`,
    )
    const { rows: v } = await t.query(
      `INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Item', 5000, 1) RETURNING "id"`,
      [p[0].id],
    )
    holder.userId = "mod"
    const bought = await purchase(v[0].id as number, 5_000)
    await openDispute({ orderId: bought.orderId!, reason: "diferente", description: PROBLEMA })
    const disputeId = (await one<{ id: number }>(`SELECT "id" FROM "dispute" WHERE "orderId" = $1`, [bought.orderId])).id

    const result = await resolveDispute({ disputeId, outcome: "comprador", note: "Me devolvam o dinheiro." })

    expect(result).toMatchObject({ ok: false })
    expect(result.error).toContain("parte deste pedido")
    expect((await disputeRow(disputeId)).status).toBe("aberta")
  })

  it("exige justificativa e não decide duas vezes", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)
    holder.userId = "mod"

    expect(await resolveDispute({ disputeId, outcome: "comprador", note: "curta" })).toMatchObject({ ok: false, field: "note" })
    expect(await resolveDispute({ disputeId, outcome: "comprador", note: "x".repeat(2_001) })).toMatchObject({ ok: false, field: "note" })

    expect((await resolveDispute({ disputeId, outcome: "comprador", note: "Conta diferente do anúncio." })).ok).toBe(true)
    expect(await resolveDispute({ disputeId, outcome: "vendedor", note: "Mudei de ideia, pague o vendedor." })).toEqual({
      ok: false,
      error: "Esta disputa já foi encerrada.",
    })

    expect(await wallet("seller")).toBeUndefined()
    expect(await wallet("buyer")).toEqual({ availableCents: 100_000, heldCents: 0 })
  })

  it("disputa inexistente", async () => {
    holder.userId = "mod"
    expect(await resolveDispute({ disputeId: 31_337, outcome: "comprador", note: "Disputa que não existe." })).toEqual({
      ok: false,
      error: "Disputa não encontrada.",
    })
  })

  it("marcar 'conta recuperada' só registra o alerta quando a decisão é a favor do comprador", async () => {
    const a = await createOrder({ delivered: true })
    const disputeA = await openAsBuyer(a.orderId)
    const b = await createOrder({ delivered: true })
    const disputeB = await openAsBuyer(b.orderId)

    holder.userId = "mod"
    await resolveDispute({ disputeId: disputeA, outcome: "comprador", note: "Vendedor retomou a conta.", accountRecovered: true })
    await resolveDispute({ disputeId: disputeB, outcome: "vendedor", note: "Tudo certo com a conta.", accountRecovered: true })

    const flags = (await t.query(`SELECT "sellerId", "disputeId" FROM "seller_account_flag"`)).rows
    expect(flags).toEqual([{ sellerId: "seller", disputeId: disputeA }])
  })

  it("sem marcar 'conta recuperada', mesmo a favor do comprador, o vendedor não é sinalizado", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)

    holder.userId = "mod"
    await resolveDispute({ disputeId, outcome: "comprador", note: "Conta diferente do anúncio." })

    expect((await t.query(`SELECT 1 FROM "seller_account_flag"`)).rows).toHaveLength(0)
  })

  it("a decisão do moderador e o reembolso automático não pagam duas vezes", async () => {
    const { orderId } = await createOrder({ delivered: true })
    const disputeId = await openAsBuyer(orderId)
    await t.query(`UPDATE "dispute" SET "sellerResponseDueAt" = now() - interval '1 hour' WHERE "id" = $1`, [disputeId])

    holder.userId = "mod"
    await resolveDispute({ disputeId, outcome: "vendedor", note: "A conta estava como anunciada." })
    expect(await sweepDisputeSla()).toBe(0)

    expect(await wallet("seller")).toEqual({ availableCents: 9_200, heldCents: 0 })
    expect(await wallet("buyer")).toEqual({ availableCents: 90_000, heldCents: 0 })
  })
})

describe("conferência do dinheiro depois das disputas", () => {
  it("decisões para os dois lados, disputa em andamento e reembolso automático: tudo bate", async () => {
    const a = await createOrder({ delivered: true, priceCents: 10_000 })
    const disputeA = await openAsBuyer(a.orderId)
    const b = await createOrder({ delivered: true, priceCents: 4_990 })
    const disputeB = await openAsBuyer(b.orderId)
    const c = await createOrder({ delivered: true, priceCents: 2_500 })
    const disputeC = await openAsBuyer(c.orderId)
    const d = await createOrder({ delivered: true, priceCents: 7_777 })
    await openAsBuyer(d.orderId) // fica aberta, dinheiro em custódia

    holder.userId = "mod"
    await resolveDispute({ disputeId: disputeA, outcome: "vendedor", note: "A conta estava como anunciada." })
    await resolveDispute({ disputeId: disputeB, outcome: "comprador", note: "Conta diferente do anúncio." })
    await t.query(`UPDATE "dispute" SET "sellerResponseDueAt" = now() - interval '1 hour' WHERE "id" = $1`, [disputeC])
    await sweepDisputeSla()

    const report = await runWalletReconciliation()
    expect(report.findings).toEqual([])
    expect(report.totals.orders).toBe(4)
  })
})
