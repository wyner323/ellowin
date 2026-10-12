import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Emails de acompanhamento. O que importa: nunca mandar o mesmo aviso duas vezes,
 * nunca derrubar a compra/entrega por causa de um email, nunca enviar fora da
 * produção (o banco local é o de produção), e nunca vazar dados de entrega nem o
 * nome legal. Banco real em memória; o envio (Resend) é um espião.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  sendMail: vi.fn(),
  captureException: vi.fn(),
  tasks: [] as Promise<unknown>[],
  afterThrows: false,
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

vi.mock("next/server", () => ({
  after: (fn: () => Promise<unknown>) => {
    if (holder.afterThrows) throw new Error("fora de um request")
    holder.tasks.push(fn())
  },
}))

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => holder.captureException(...args),
  captureMessage: () => {},
}))

import { notificationsLive, notifyOrder, notifyQuestion } from "@/lib/notify"
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

let productId: number
let variantId: number

beforeEach(async () => {
  await t.query(
    `TRUNCATE "notification_log", "product_question", "order", "product_variant", "product", "seller_application", "user" RESTART IDENTITY CASCADE`,
  )
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('ana', 'Ana Maria da Silva', 'ana@teste.dev', 'AnaGames')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('comprador', 'Carlos Pereira Lima', 'carlos@teste.dev', 'CarlosPlay')`)
  await t.query(`INSERT INTO "seller_application" ("userId", "storeName", "status") VALUES ('ana', 'Loja da Ana', 'aprovado')`)
  const p = await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game") VALUES ('ana', 'conta-valorant', 'Conta Valorant', 'contas', 'Valorant') RETURNING "id"`)
  productId = p.rows[0].id as number
  const v = await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Imortal', 10000, 3) RETURNING "id"`, [productId])
  variantId = v.rows[0].id as number

  holder.tasks.length = 0
  holder.afterThrows = false
  holder.sendMail.mockReset()
  holder.sendMail.mockResolvedValue({ sent: true })
  holder.captureException.mockReset()
  vi.stubEnv("ELLOWIN_NOTIFY", "1") // padrão dos testes: envio ligado
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function settle() {
  await Promise.all(holder.tasks)
  holder.tasks.length = 0
}

async function addOrder(opts: { status?: string; payload?: string | null } = {}) {
  const { rows } = await t.query(
    `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents", "status", "deliveryPayload", "deliveryDueAt")
     VALUES ('comprador', 'ana', $1, $2, 'Conta Valorant', 'Imortal', 10000, 800, 9200, $3, $4, '2099-01-01 12:00:00') RETURNING "id"`,
    [productId, variantId, opts.status ?? "aguardando_entrega", opts.payload ?? null],
  )
  return rows[0].id as number
}

type MailArgs = [to: string, subject: string, html: string, label: string]
const mails = () => holder.sendMail.mock.calls as MailArgs[]
const mailTo = (to: string) => mails().find((m) => m[0] === to)
const logRows = async () => (await t.query(`SELECT "userId", "kind", "refId" FROM "notification_log" ORDER BY "userId"`)).rows

/* ---------------------------------------------------------------------------
 * notificationsLive
 * ------------------------------------------------------------------------ */

describe("notificationsLive", () => {
  it("só liga na produção de verdade (NODE_ENV e VERCEL_ENV production) ou com ELLOWIN_NOTIFY=1", () => {
    vi.stubEnv("ELLOWIN_NOTIFY", "")
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL_ENV", "production")
    expect(notificationsLive()).toBe(true)

    vi.stubEnv("VERCEL_ENV", "preview")
    expect(notificationsLive()).toBe(false)

    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("NODE_ENV", "development") // `next dev` com .env.local de produção puxado
    expect(notificationsLive()).toBe(false)

    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("VERCEL_ENV", "")
    expect(notificationsLive()).toBe(false)

    vi.stubEnv("ELLOWIN_NOTIFY", "1")
    expect(notificationsLive()).toBe(true)
    vi.stubEnv("ELLOWIN_NOTIFY", "true") // só "1" vale
    expect(notificationsLive()).toBe(false)
  })
})

/* ---------------------------------------------------------------------------
 * notifyOrder
 * ------------------------------------------------------------------------ */

describe("notifyOrder", () => {
  it("FORA da produção não envia nada nem grava reserva (só registra no log)", async () => {
    vi.stubEnv("ELLOWIN_NOTIFY", "")
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const id = await addOrder()
    notifyOrder("order_created", id)
    await settle()
    expect(holder.sendMail).not.toHaveBeenCalled()
    expect(await logRows()).toEqual([])
    expect(log.mock.calls.some((c) => String(c[0]).includes("[notify:simulado] order_created"))).toBe(true)
  })

  it("venda nova: avisa vendedor E comprador, cada um no próprio email, com link do pedido", async () => {
    const id = await addOrder()
    notifyOrder("order_created", id)
    await settle()

    expect(mails()).toHaveLength(2)
    const vendedor = mailTo("ana@teste.dev")!
    const comprador = mailTo("carlos@teste.dev")!
    expect(vendedor[1]).toBe("Nova venda: Conta Valorant")
    expect(comprador[1]).toBe("Compra realizada: Conta Valorant")
    expect(vendedor[2]).toContain(`${SITE_URL}/pedidos/${id}`)
    expect(comprador[2]).toContain(`${SITE_URL}/pedidos/${id}`)
    expect(vendedor[3]).toBe("order_created")
    expect(await logRows()).toEqual([
      { userId: "ana", kind: "order_created", refId: `order:${id}` },
      { userId: "comprador", kind: "order_created", refId: `order:${id}` },
    ])
  })

  it("só nomes públicos: apelido do comprador, loja do vendedor; nunca nome legal nem email da outra parte", async () => {
    const id = await addOrder({ status: "entregue" })
    notifyOrder("order_created", id)
    notifyOrder("order_delivered", id)
    await settle()
    const todo = mails().map((m) => m[1] + m[2]).join("\n")
    expect(mailTo("ana@teste.dev")![2]).toContain("CarlosPlay")
    const entregue = mails().find((m) => m[3] === "order_delivered")!
    expect(entregue[0]).toBe("carlos@teste.dev")
    expect(entregue[2]).toContain("Loja da Ana")
    expect(todo).not.toContain("Carlos Pereira Lima")
    expect(todo).not.toContain("Ana Maria da Silva")
    for (const m of mails().filter((x) => x[0] === "ana@teste.dev")) expect(m[2]).not.toContain("carlos@teste.dev")
    for (const m of mails().filter((x) => x[0] === "carlos@teste.dev")) expect(m[2]).not.toContain("ana@teste.dev")
  })

  it("vendedor sem loja: usa o apelido; sem apelido, o nome", async () => {
    await t.query(`DELETE FROM "seller_application"`)
    const id = await addOrder({ status: "entregue" })
    notifyOrder("order_delivered", id)
    await settle()
    expect(mailTo("carlos@teste.dev")![2]).toContain("AnaGames")

    holder.sendMail.mockClear()
    await t.query(`TRUNCATE "notification_log"`)
    await t.query(`UPDATE "user" SET "displayName" = NULL WHERE "id" = 'ana'`)
    notifyOrder("order_delivered", id)
    await settle()
    expect(mailTo("carlos@teste.dev")![2]).toContain("Ana Maria da Silva")
  })

  it("NUNCA manda os dados de entrega por email", async () => {
    const id = await addOrder({ status: "entregue", payload: "login: abc senha: segredo123" })
    notifyOrder("order_delivered", id)
    await settle()
    expect(mails().length).toBeGreaterThan(0)
    for (const m of mails()) {
      expect(m[1] + m[2]).not.toContain("segredo123")
      expect(m[1] + m[2]).not.toContain("abc senha")
    }
  })

  it("o mesmo aviso (usuário, tipo, pedido) sai uma vez só, mesmo chamado de novo", async () => {
    const id = await addOrder()
    notifyOrder("order_created", id)
    await settle()
    notifyOrder("order_created", id)
    notifyOrder("order_created", id)
    await settle()
    expect(mails()).toHaveLength(2)
    expect(await logRows()).toHaveLength(2)
  })

  it("tipos diferentes do mesmo pedido e pedidos diferentes não se bloqueiam", async () => {
    const a = await addOrder({ status: "entregue" })
    const b = await addOrder({ status: "entregue" })
    notifyOrder("order_delivered", a)
    notifyOrder("order_delivered", b)
    notifyOrder("order_completed", a)
    await settle()
    // delivered: só o comprador (1 cada) = 2; completed: só o vendedor = 1
    expect(mails()).toHaveLength(3)
  })

  it("com vários pedidos, cada aviso fala do SEU pedido (título, valor e link)", async () => {
    const primeiro = await addOrder()
    await t.query(`UPDATE "order" SET "productTitle" = 'Primeiro produto' WHERE "id" = $1`, [primeiro])
    const segundo = await addOrder()
    await t.query(`UPDATE "order" SET "productTitle" = 'Segundo produto', "amountCents" = 7777 WHERE "id" = $1`, [segundo])
    notifyOrder("order_created", segundo)
    await settle()
    expect(mails()).toHaveLength(2)
    for (const m of mails()) {
      expect(m[1]).toContain("Segundo produto")
      expect(m[2]).toContain(`${SITE_URL}/pedidos/${segundo}`)
      expect(m[2]).not.toContain("Primeiro produto")
    }
  })

  it("chamadas simultâneas do mesmo aviso: só uma vence a reserva", async () => {
    const id = await addOrder()
    for (let i = 0; i < 5; i++) notifyOrder("order_created", id)
    await settle()
    expect(mails()).toHaveLength(2)
  })

  it("envio que falha libera a reserva: a próxima tentativa envia", async () => {
    const id = await addOrder()
    holder.sendMail.mockResolvedValue({ sent: false, error: "sem chave" })
    notifyOrder("order_created", id)
    await settle()
    expect(await logRows()).toEqual([])

    holder.sendMail.mockResolvedValue({ sent: true })
    notifyOrder("order_created", id)
    await settle()
    expect(await logRows()).toHaveLength(2)
  })

  it("falha para um destinatário não impede o outro, e só o que falhou é reenviado", async () => {
    const id = await addOrder()
    holder.sendMail.mockImplementation(async (to: string) => ({ sent: to !== "ana@teste.dev" }))
    notifyOrder("order_created", id)
    await settle()
    expect(await logRows()).toEqual([{ userId: "comprador", kind: "order_created", refId: `order:${id}` }])

    holder.sendMail.mockClear()
    holder.sendMail.mockResolvedValue({ sent: true })
    notifyOrder("order_created", id)
    await settle()
    expect(mails().map((m) => m[0])).toEqual(["ana@teste.dev"])
    expect(await logRows()).toHaveLength(2)
  })

  it("erro inesperado no envio não estoura para quem chamou, vai ao Sentry e libera a reserva", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const id = await addOrder()
    holder.sendMail.mockRejectedValue(new Error("rede caiu"))
    expect(() => notifyOrder("order_created", id)).not.toThrow()
    await settle()
    expect(holder.captureException).toHaveBeenCalled()
    expect(await logRows()).toEqual([]) // sem reserva presa: dá para tentar de novo

    holder.sendMail.mockResolvedValue({ sent: true })
    notifyOrder("order_created", id)
    await settle()
    expect(mails().filter((m) => m[0] === "ana@teste.dev")).toHaveLength(2) // 1 tentativa que caiu + 1 que enviou
    expect(await logRows()).toHaveLength(2)
  })

  it("pedido inexistente: nada acontece", async () => {
    notifyOrder("order_created", 999)
    await settle()
    expect(holder.sendMail).not.toHaveBeenCalled()
    expect(await logRows()).toEqual([])
  })

  it("destinatário sem email: não envia, e não deixa de avisar o outro", async () => {
    await t.query(`UPDATE "user" SET "email" = '' WHERE "id" = 'ana'`)
    const id = await addOrder()
    notifyOrder("order_created", id)
    await settle()
    expect(mails().map((m) => m[0])).toEqual(["carlos@teste.dev"])
  })

  it("fora de um request (after indisponível) roda direto, sem lançar", async () => {
    holder.afterThrows = true
    const id = await addOrder()
    notifyOrder("order_created", id)
    await vi.waitFor(() => expect(holder.sendMail).toHaveBeenCalledTimes(2))
  })

  it("o desfecho informado muda o texto (disputa resolvida a favor de quem)", async () => {
    const id = await addOrder({ status: "em_disputa" })
    notifyOrder("dispute_resolved", id, { outcome: "comprador" })
    await settle()
    const favorComprador = mails().map((m) => m[2]).join("\n")
    await t.query(`TRUNCATE "notification_log"`)
    holder.sendMail.mockClear()
    notifyOrder("dispute_resolved", id, { outcome: "vendedor" })
    await settle()
    const favorVendedor = mails().map((m) => m[2]).join("\n")
    expect(favorComprador).not.toBe(favorVendedor)
  })
})

/* ---------------------------------------------------------------------------
 * notifyQuestion
 * ------------------------------------------------------------------------ */

describe("notifyQuestion", () => {
  async function addQuestion(answer: string | null = null) {
    const { rows } = await t.query(
      `INSERT INTO "product_question" ("productId", "askerId", "question", "answer", "answeredAt") VALUES ($1, 'comprador', 'Tem garantia de rank?', $2, CASE WHEN $2::text IS NULL THEN NULL ELSE now() END) RETURNING "id"`,
      [productId, answer],
    )
    return rows[0].id as number
  }

  it("pergunta nova avisa o VENDEDOR, com o texto e o apelido de quem perguntou", async () => {
    const q = await addQuestion()
    notifyQuestion("question_asked", q)
    await settle()
    expect(mails()).toHaveLength(1)
    expect(mails()[0][0]).toBe("ana@teste.dev")
    expect(mails()[0][2]).toContain("Tem garantia de rank?")
    expect(mails()[0][2]).toContain("CarlosPlay")
    expect(mails()[0][2]).not.toContain("Carlos Pereira Lima")
    expect(await logRows()).toEqual([{ userId: "ana", kind: "question_asked", refId: `question:${q}` }])
  })

  it("resposta avisa quem PERGUNTOU, com o texto da resposta", async () => {
    const q = await addQuestion("Sim, até o fim da temporada.")
    notifyQuestion("question_answered", q)
    await settle()
    expect(mails()).toHaveLength(1)
    expect(mails()[0][0]).toBe("carlos@teste.dev")
    expect(mails()[0][2]).toContain("Sim, até o fim da temporada.")
  })

  it("não repete o aviso da mesma pergunta; fora da produção não envia", async () => {
    const q = await addQuestion()
    notifyQuestion("question_asked", q)
    notifyQuestion("question_asked", q)
    await settle()
    expect(mails()).toHaveLength(1)

    vi.stubEnv("ELLOWIN_NOTIFY", "")
    vi.spyOn(console, "log").mockImplementation(() => {})
    holder.sendMail.mockClear()
    const q2 = await addQuestion()
    notifyQuestion("question_asked", q2)
    await settle()
    expect(holder.sendMail).not.toHaveBeenCalled()
  })

  it("pergunta inexistente: nada acontece", async () => {
    notifyQuestion("question_asked", 999)
    await settle()
    expect(holder.sendMail).not.toHaveBeenCalled()
  })
})
