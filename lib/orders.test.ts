import { randomBytes } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Leitura de pedidos e disputas. Aqui mora o controle de quem pode ver o quê:
 * comprador e vendedor só veem o que é seu, a moderação vê tudo, nota interna
 * nunca chega às partes, o nome legal nunca aparece no lugar do apelido e os
 * dados de entrega só saem (decifrados) no detalhe do pedido.
 */

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

import {
  countDisputesExcluding,
  getBuyerOrderSummary,
  getBuyerOrdersPage,
  getDisputeByOrder,
  getDisputeDetail,
  getDisputeMessages,
  getDisputeQueue,
  getMyOpenDisputes,
  getOrderDetail,
  getOrderMessages,
  getSellerOrderAggregates,
  getSellerOrdersPage,
} from "@/lib/orders"
import { encryptField } from "@/lib/secret-box"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

const KEY = randomBytes(32).toString("base64")

beforeEach(async () => {
  await t.query(
    `TRUNCATE "dispute_message", "order_message", "dispute", "review", "order", "product_variant", "product", "seller_application", "user" RESTART IDENTITY CASCADE`,
  )
  // ana tem apelido; bia só tem o nome (sem apelido); os compradores também.
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('ana', 'Ana Maria da Silva', 'ana@teste.dev', 'AnaGames')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ('bia', 'Bia Souza', 'bia@teste.dev')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('comprador', 'Carlos Pereira Lima', 'carlos@teste.dev', 'CarlosPlay')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ('outro', 'Outro Comprador', 'outro@teste.dev')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ('mod', 'Moderadora', 'mod@teste.dev')`)
  await t.query(`INSERT INTO "seller_application" ("userId", "storeName", "status") VALUES ('ana', 'Loja da Ana', 'aprovado')`)
  process.env.DELIVERY_ENCRYPTION_KEY = KEY
})

afterEach(() => {
  delete process.env.DELIVERY_ENCRYPTION_KEY
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

let seq = 0
const variantOf = new Map<number, number>()

async function addProduct(seller = "ana", slug?: string) {
  seq++
  const { rows } = await t.query(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game", "status") VALUES ($1, $2, 'Anúncio', 'contas', 'Valorant', 'ativo') RETURNING "id"`,
    [seller, slug ?? `p-${seq}`],
  )
  const id = rows[0].id as number
  const v = await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Item', 1000, 5) RETURNING "id"`, [id])
  variantOf.set(id, v.rows[0].id as number)
  return id
}

let defaultProduct: number
beforeEach(async () => {
  defaultProduct = await addProduct("ana", "conta-valorant")
})

/** Pedidos nascem em minutos crescentes a partir de uma base, a menos que `at` seja dado. */
let tick = 0
async function addOrder(
  opts: {
    buyer?: string
    seller?: string
    product?: number
    status?: string
    at?: string
    net?: number
    amount?: number
    completedAt?: string | null
    title?: string
  } = {},
) {
  tick++
  const product = opts.product ?? defaultProduct
  const amount = opts.amount ?? 1000
  const { rows } = await t.query(
    `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents", "status", "createdAt", "completedAt")
     VALUES ($1, $2, $3, $4, $5, 'Item', $6, 0, $7, $8, COALESCE($9::timestamp, '2026-01-01 10:00:00'::timestamp + make_interval(mins => ${tick})), $10::timestamp)
     RETURNING "id"`,
    [
      opts.buyer ?? "comprador",
      opts.seller ?? "ana",
      product,
      variantOf.get(product),
      opts.title ?? "Conta Valorant",
      amount,
      opts.net ?? amount,
      opts.status ?? "concluido",
      opts.at ?? null,
      opts.completedAt ?? null,
    ],
  )
  return rows[0].id as number
}

async function addReview(orderId: number, rating = 5) {
  await t.query(`INSERT INTO "review" ("orderId", "productId", "sellerId", "buyerId", "rating") VALUES ($1, $2, 'ana', 'comprador', $3)`, [orderId, defaultProduct, rating])
}

async function addDispute(
  orderId: number,
  opts: { status?: string; openedBy?: string; resolutionDue?: string; createdAt?: string } = {},
) {
  const { rows } = await t.query(
    `INSERT INTO "dispute" ("orderId", "openedBy", "reason", "description", "status", "firstContactDueAt", "sellerResponseDueAt", "resolutionDueAt", "createdAt")
     VALUES ($1, $2, 'diferente', 'descrição', $3, '2026-02-01 10:00:00', '2026-02-02 10:00:00', COALESCE($4::timestamp, '2026-02-03 10:00:00'), COALESCE($5::timestamp, '2026-02-01 08:00:00'))
     RETURNING "id"`,
    [orderId, opts.openedBy ?? "comprador", opts.status ?? "aberta", opts.resolutionDue ?? null, opts.createdAt ?? null],
  )
  return rows[0].id as number
}

/* ---------------------------------------------------------------------------
 * getBuyerOrdersPage
 * ------------------------------------------------------------------------ */

describe("getBuyerOrdersPage", () => {
  it("mostra só as compras de quem olha, com total", async () => {
    await addOrder()
    await addOrder()
    await addOrder({ buyer: "outro" })
    const r = await getBuyerOrdersPage("comprador", { page: 1 })
    expect(r.total).toBe(2)
    expect(r.orders).toHaveLength(2)
    expect(r.orders.every((o) => o.buyerId === "comprador")).toBe(true)
    expect((await getBuyerOrdersPage("nao-existe", { page: 1 })).orders).toEqual([])
  })

  it("filtro de status vale para o total e para a lista", async () => {
    await addOrder({ status: "concluido" })
    await addOrder({ status: "concluido" })
    await addOrder({ status: "cancelado" })
    await addOrder({ buyer: "outro", status: "cancelado" }) // outro comprador, mesmo status
    const r = await getBuyerOrdersPage("comprador", { status: "cancelado", page: 1 })
    expect(r.total).toBe(1)
    expect(r.orders.map((o) => [o.status, o.buyerId])).toEqual([["cancelado", "comprador"]])
    expect((await getBuyerOrdersPage("comprador", { status: "reembolsado", page: 1 })).total).toBe(0)
  })

  it("ordem: o que pede ação do comprador primeiro (entregue, disputa, aguardando), depois o resto do mais novo ao mais antigo", async () => {
    const concluidoVelho = await addOrder({ status: "concluido" })
    const aguardando = await addOrder({ status: "aguardando_entrega" })
    const disputa = await addOrder({ status: "em_disputa" })
    const entregue = await addOrder({ status: "entregue" })
    const concluidoNovo = await addOrder({ status: "concluido" })
    const r = await getBuyerOrdersPage("comprador", { page: 1 })
    expect(r.orders.map((o) => o.id)).toEqual([entregue, disputa, aguardando, concluidoNovo, concluidoVelho])
  })

  it("dentro do mesmo grupo, mais novo primeiro; empate de data desempata pelo id maior", async () => {
    const velho = await addOrder({ at: "2026-01-01 10:00:00" })
    const novo = await addOrder({ at: "2026-03-01 10:00:00" })
    const empateA = await addOrder({ at: "2026-02-01 10:00:00" })
    const empateB = await addOrder({ at: "2026-02-01 10:00:00" })
    const r = await getBuyerOrdersPage("comprador", { page: 1 })
    expect(r.orders.map((o) => o.id)).toEqual([novo, empateB, empateA, velho])
  })

  it("pagina de 20 em 20, sem repetir nem pular, e página além do fim cai na última", async () => {
    const ids: number[] = []
    for (let i = 0; i < 25; i++) ids.push(await addOrder())
    const p1 = await getBuyerOrdersPage("comprador", { page: 1 })
    const p2 = await getBuyerOrdersPage("comprador", { page: 2 })
    expect([p1.total, p1.pages, p1.orders.length]).toEqual([25, 2, 20])
    expect([p2.page, p2.orders.length]).toEqual([2, 5])
    const seen = [...p1.orders, ...p2.orders].map((o) => o.id)
    expect(new Set(seen).size).toBe(25)
    expect(seen).toEqual([...ids].reverse()) // todos concluídos: mais novo primeiro
    const alem = await getBuyerOrdersPage("comprador", { page: 99 })
    expect(alem.page).toBe(2)
    expect(alem.orders.map((o) => o.id)).toEqual(p2.orders.map((o) => o.id))
  })

  it("traz o vendedor pelo APELIDO (nunca o nome legal), a loja e o endereço do anúncio", async () => {
    await addOrder()
    const [o] = (await getBuyerOrdersPage("comprador", { page: 1 })).orders
    expect(o.sellerName).toBe("AnaGames")
    expect(JSON.stringify(o)).not.toContain("Ana Maria da Silva")
    expect(o.storeName).toBe("Loja da Ana")
    expect(o.productSlug).toBe("conta-valorant")
  })

  it("sem apelido, vira rótulo anônimo (nunca o nome legal); vendedor sem loja deixa storeName nulo", async () => {
    const p = await addProduct("bia")
    await addOrder({ seller: "bia", product: p })
    const [o] = (await getBuyerOrdersPage("comprador", { page: 1 })).orders
    expect(o.sellerName).toBe("Usuário BIA")
    expect(JSON.stringify(o)).not.toContain("Bia Souza")
    expect(o.storeName).toBeNull()
  })

  it("marca avaliado e disputa por pedido; não carrega os dados de entrega", async () => {
    const a = await addOrder()
    const b = await addOrder()
    const c = await addOrder({ status: "em_disputa" })
    await t.query(`UPDATE "order" SET "deliveryPayload" = 'login:segredo' WHERE "id" = $1`, [a])
    await addReview(a)
    const d = await addDispute(c, { status: "em_analise" })
    const orders = (await getBuyerOrdersPage("comprador", { page: 1 })).orders
    const by = (id: number) => orders.find((o) => o.id === id)!
    expect([by(a).reviewed, by(a).disputeId]).toEqual([true, null])
    expect([by(b).reviewed, by(b).disputeId, by(b).disputeStatus]).toEqual([false, null, null])
    expect([by(c).reviewed, by(c).disputeId, by(c).disputeStatus]).toEqual([false, d, "em_analise"])
    for (const o of orders) expect(o).not.toHaveProperty("deliveryPayload")
    expect(JSON.stringify(orders)).not.toContain("segredo")
  })
})

/* ---------------------------------------------------------------------------
 * getBuyerOrderSummary
 * ------------------------------------------------------------------------ */

describe("getBuyerOrderSummary", () => {
  it("conta e soma por status, só do comprador", async () => {
    await addOrder({ status: "concluido", amount: 1000 })
    await addOrder({ status: "concluido", amount: 2500 })
    await addOrder({ status: "aguardando_entrega", amount: 700 })
    await addOrder({ buyer: "outro", status: "concluido", amount: 99_999 })
    const s = await getBuyerOrderSummary("comprador")
    expect(s.allCount).toBe(3)
    expect(s.stat("concluido")).toMatchObject({ count: 2, totalCents: 3500 })
    expect(s.stat("aguardando_entrega")).toMatchObject({ count: 1, totalCents: 700 })
    expect(s.stat("cancelado")).toBeUndefined()
  })

  it("avaliações pendentes: só concluídos sem avaliação", async () => {
    await addOrder({ status: "concluido" })
    await addOrder({ status: "concluido" })
    const avaliado = await addOrder({ status: "concluido" })
    await addOrder({ status: "entregue" })
    await addOrder({ status: "cancelado" })
    await addOrder({ buyer: "outro", status: "concluido" })
    await addReview(avaliado)
    const s = await getBuyerOrderSummary("comprador")
    expect(s.pendingReviews).toBe(2)
  })

  it("sem compras: zeros", async () => {
    const s = await getBuyerOrderSummary("comprador")
    expect([s.allCount, s.pendingReviews, s.byStatus]).toEqual([0, 0, []])
  })
})

/* ---------------------------------------------------------------------------
 * getSellerOrdersPage
 * ------------------------------------------------------------------------ */

describe("getSellerOrdersPage", () => {
  it("mostra só as vendas do vendedor", async () => {
    const pBia = await addProduct("bia")
    await addOrder()
    await addOrder({ seller: "bia", product: pBia })
    const r = await getSellerOrdersPage("ana", { page: 1 })
    expect(r.total).toBe(1)
    expect(r.orders.map((o) => o.sellerId)).toEqual(["ana"])
  })

  it("total acompanha o filtro, mas allCount e pendingCount ignoram o filtro", async () => {
    await addOrder({ status: "concluido" })
    await addOrder({ status: "concluido" })
    await addOrder({ status: "aguardando_entrega" })
    await addOrder({ status: "aguardando_entrega" })
    await addOrder({ status: "aguardando_entrega" })
    await addOrder({ status: "cancelado" })
    const filtrado = await getSellerOrdersPage("ana", { status: "concluido", page: 1 })
    expect([filtrado.total, filtrado.orders.length, filtrado.allCount, filtrado.pendingCount]).toEqual([2, 2, 6, 3])
    const todos = await getSellerOrdersPage("ana", { page: 1 })
    expect([todos.total, todos.allCount, todos.pendingCount]).toEqual([6, 6, 3])
    const vazio = await getSellerOrdersPage("ana", { status: "reembolsado", page: 1 })
    expect([vazio.total, vazio.orders.length, vazio.allCount]).toEqual([0, 0, 6])
  })

  it("ordem: entregar primeiro, depois disputa, depois o resto do mais novo ao mais antigo", async () => {
    const concluidoVelho = await addOrder({ status: "concluido" })
    const entregue = await addOrder({ status: "entregue" }) // para o vendedor não é prioridade
    const disputa = await addOrder({ status: "em_disputa" })
    const aguardando = await addOrder({ status: "aguardando_entrega" })
    const concluidoNovo = await addOrder({ status: "concluido" })
    const r = await getSellerOrdersPage("ana", { page: 1 })
    expect(r.orders.map((o) => o.id)).toEqual([aguardando, disputa, concluidoNovo, entregue, concluidoVelho])
  })

  it("pagina de 20 em 20 e página além do fim cai na última", async () => {
    for (let i = 0; i < 21; i++) await addOrder()
    const r = await getSellerOrdersPage("ana", { page: 50 })
    expect([r.page, r.pages, r.total, r.orders.length]).toEqual([2, 2, 21, 1])
  })

  it("comprador aparece pelo apelido (ou rótulo anônimo, sem apelido); nunca o nome legal", async () => {
    await addOrder()
    await addOrder({ buyer: "outro" })
    const orders = (await getSellerOrdersPage("ana", { page: 1 })).orders
    expect(orders.map((o) => o.buyerName).sort()).toEqual(["CarlosPlay", "Usuário UTRO"])
    expect(JSON.stringify(orders)).not.toContain("Carlos Pereira Lima")
    expect(JSON.stringify(orders)).not.toContain("Outro Comprador")
    expect(orders[0].productSlug).toBe("conta-valorant")
  })

  it("marca avaliação e disputa e não carrega dados de entrega", async () => {
    const a = await addOrder()
    const b = await addOrder({ status: "em_disputa" })
    await t.query(`UPDATE "order" SET "deliveryPayload" = 'senha-secreta' WHERE "id" = $1`, [a])
    await addReview(a)
    const d = await addDispute(b)
    const orders = (await getSellerOrdersPage("ana", { page: 1 })).orders
    const by = (id: number) => orders.find((o) => o.id === id)!
    expect([by(a).reviewed, by(a).disputeId]).toEqual([true, null])
    expect([by(b).reviewed, by(b).disputeId, by(b).disputeStatus]).toEqual([false, d, "aberta"])
    expect(JSON.stringify(orders)).not.toContain("senha-secreta")
  })

  it("vendedor sem vendas: tudo zerado", async () => {
    const r = await getSellerOrdersPage("ana", { page: 1 })
    expect([r.total, r.allCount, r.pendingCount, r.orders]).toEqual([0, 0, 0, []])
  })
})

/* ---------------------------------------------------------------------------
 * getSellerOrderAggregates
 * ------------------------------------------------------------------------ */

describe("getSellerOrderAggregates", () => {
  it("soma o LÍQUIDO do vendedor por status, só dele", async () => {
    const pBia = await addProduct("bia")
    await addOrder({ status: "concluido", amount: 1000, net: 920 })
    await addOrder({ status: "concluido", amount: 2000, net: 1840 })
    await addOrder({ status: "aguardando_entrega", amount: 500, net: 460 })
    await addOrder({ seller: "bia", product: pBia, status: "concluido", amount: 9999, net: 9999 })
    const a = await getSellerOrderAggregates("ana")
    expect(a.stat("concluido")).toMatchObject({ count: 2, totalCents: 2760 })
    expect(a.stat("aguardando_entrega")).toMatchObject({ count: 1, totalCents: 460 })
    expect(a.byStatus).toHaveLength(2)
  })

  it("sem vendas: lista vazia", async () => {
    const a = await getSellerOrderAggregates("ana")
    expect(a.byStatus).toEqual([])
  })
})

/* ---------------------------------------------------------------------------
 * getOrderDetail
 * ------------------------------------------------------------------------ */

describe("getOrderDetail", () => {
  it("pedido inexistente devolve nulo", async () => {
    expect(await getOrderDetail(999, "comprador")).toBeNull()
  })

  it("comprador e vendedor veem; estranho NÃO vê; moderação vê", async () => {
    const id = await addOrder({ status: "entregue" })
    expect((await getOrderDetail(id, "comprador"))?.viewer).toEqual({ isBuyer: true, isSeller: false, isStaff: false })
    expect((await getOrderDetail(id, "ana"))?.viewer).toEqual({ isBuyer: false, isSeller: true, isStaff: false })
    expect(await getOrderDetail(id, "outro")).toBeNull()
    expect(await getOrderDetail(id, "bia")).toBeNull() // outro vendedor
    expect(await getOrderDetail(id, "mod")).toBeNull() // staff só vale com a flag
    expect((await getOrderDetail(id, "mod", true))?.viewer).toEqual({ isBuyer: false, isSeller: false, isStaff: true })
  })

  it("estranho não vê nem os dados de entrega: nulo antes de qualquer decifragem", async () => {
    const id = await addOrder({ status: "entregue" })
    await t.query(`UPDATE "order" SET "deliveryPayload" = $2 WHERE "id" = $1`, [id, encryptField("login:x senha:y", `order:${id}`)])
    expect(await getOrderDetail(id, "outro")).toBeNull()
  })

  it("devolve os dados do pedido, nomes públicos e a loja", async () => {
    const id = await addOrder({ status: "entregue", amount: 2500 })
    const d = await getOrderDetail(id, "comprador")
    expect(d).toMatchObject({
      id,
      amountCents: 2500,
      status: "entregue",
      buyerName: "CarlosPlay",
      sellerName: "AnaGames",
      storeName: "Loja da Ana",
      productSlug: "conta-valorant",
      review: null,
      dispute: null,
    })
    expect(JSON.stringify(d?.buyerName) + JSON.stringify(d?.sellerName)).not.toContain("Silva")
  })

  it("decifra os dados de entrega gravados cifrados (com a chave configurada)", async () => {
    const id = await addOrder({ status: "entregue" })
    const cifrado = encryptField("login: abc / senha: 123", `order:${id}`)
    expect(cifrado.startsWith("enc:v1:")).toBe(true)
    await t.query(`UPDATE "order" SET "deliveryPayload" = $2 WHERE "id" = $1`, [id, cifrado])
    expect((await getOrderDetail(id, "comprador"))?.deliveryPayload).toBe("login: abc / senha: 123")
    expect((await getOrderDetail(id, "ana"))?.deliveryPayload).toBe("login: abc / senha: 123")
  })

  it("moderação (que não é parte) só lê os dados de entrega com disputa ABERTA", async () => {
    const id = await addOrder({ status: "em_disputa" })
    await t.query(`UPDATE "order" SET "deliveryPayload" = $2 WHERE "id" = $1`, [id, encryptField("login: abc / senha: 123", `order:${id}`)])
    // sem disputa registrada
    expect((await getOrderDetail(id, "mod", true))?.deliveryPayload).toBeNull()
    const d = await addDispute(id, { status: "aberta" })
    expect((await getOrderDetail(id, "mod", true))?.deliveryPayload).toBe("login: abc / senha: 123")
    await t.query(`UPDATE "dispute" SET "status" = 'em_analise' WHERE "id" = $1`, [d])
    expect((await getOrderDetail(id, "mod", true))?.deliveryPayload).toBe("login: abc / senha: 123")
    // encerrada, de qualquer forma: a moderação deixa de ler as credenciais
    for (const status of ["resolvida_comprador", "resolvida_vendedor", "cancelada"]) {
      await t.query(`UPDATE "dispute" SET "status" = $2 WHERE "id" = $1`, [d, status])
      expect((await getOrderDetail(id, "mod", true))?.deliveryPayload).toBeNull()
    }
    // as partes continuam lendo sempre, inclusive depois de encerrada
    expect((await getOrderDetail(id, "comprador"))?.deliveryPayload).toBe("login: abc / senha: 123")
    expect((await getOrderDetail(id, "ana"))?.deliveryPayload).toBe("login: abc / senha: 123")
  })

  it("moderador que é a própria parte lê como parte", async () => {
    const id = await addOrder({ status: "entregue", buyer: "mod" })
    await t.query(`UPDATE "order" SET "deliveryPayload" = $2 WHERE "id" = $1`, [id, encryptField("meu acesso", `order:${id}`)])
    expect((await getOrderDetail(id, "mod", true))?.deliveryPayload).toBe("meu acesso")
  })

  it("dado legado em texto puro continua legível; sem dado devolve nulo", async () => {
    const com = await addOrder({ status: "entregue" })
    const sem = await addOrder({ status: "aguardando_entrega" })
    await t.query(`UPDATE "order" SET "deliveryPayload" = 'texto antigo' WHERE "id" = $1`, [com])
    expect((await getOrderDetail(com, "comprador"))?.deliveryPayload).toBe("texto antigo")
    expect((await getOrderDetail(sem, "comprador"))?.deliveryPayload).toBeNull()
  })

  it("dado cifrado copiado para OUTRO pedido não decifra (contexto autenticado)", async () => {
    const a = await addOrder({ status: "entregue" })
    const b = await addOrder({ status: "entregue" })
    await t.query(`UPDATE "order" SET "deliveryPayload" = $2 WHERE "id" = $1`, [b, encryptField("segredo do pedido A", `order:${a}`)])
    // Não derruba a página do pedido: o dado vem nulo e a tela explica que não pôde ser lido.
    const d = await getOrderDetail(b, "comprador")
    expect(d?.deliveryPayload).toBeNull()
    expect(d?.payloadUnreadable).toBe(true)
  })

  it("dado cifrado sem a chave configurada não é mostrado nem derruba o pedido", async () => {
    const id = await addOrder({ status: "entregue" })
    await t.query(`UPDATE "order" SET "deliveryPayload" = $2 WHERE "id" = $1`, [id, encryptField("x", `order:${id}`)])
    delete process.env.DELIVERY_ENCRYPTION_KEY
    const d = await getOrderDetail(id, "comprador")
    expect(d).toMatchObject({ deliveryPayload: null, payloadUnreadable: true })
    expect(d?.buyerId).toBe("comprador") // o resto do pedido continua acessível (confirmar, disputar)
  })

  it("dado legível não marca payloadUnreadable", async () => {
    const id = await addOrder({ status: "entregue" })
    await t.query(`UPDATE "order" SET "deliveryPayload" = $2 WHERE "id" = $1`, [id, encryptField("login: x", `order:${id}`)])
    expect(await getOrderDetail(id, "comprador")).toMatchObject({ deliveryPayload: "login: x", payloadUnreadable: false })
  })

  it("anexa a avaliação e a disputa do pedido", async () => {
    const id = await addOrder({ status: "em_disputa" })
    await addReview(id, 4)
    const disputeId = await addDispute(id)
    const d = await getOrderDetail(id, "ana")
    expect(d?.review).toMatchObject({ orderId: id, rating: 4 })
    expect(d?.dispute).toMatchObject({ id: disputeId, orderId: id, status: "aberta" })
  })
})

/* ---------------------------------------------------------------------------
 * Chats
 * ------------------------------------------------------------------------ */

describe("getOrderMessages", () => {
  it("só as mensagens do pedido, da mais antiga para a mais nova, com apelido e sem nome legal", async () => {
    const a = await addOrder()
    const b = await addOrder()
    await t.query(`INSERT INTO "order_message" ("orderId", "authorId", "authorRole", "body", "createdAt") VALUES ($1, 'ana', 'seller', 'segunda', '2026-01-01 10:05:00')`, [a])
    await t.query(`INSERT INTO "order_message" ("orderId", "authorId", "authorRole", "body", "createdAt") VALUES ($1, 'comprador', 'buyer', 'primeira', '2026-01-01 10:00:00')`, [a])
    await t.query(`INSERT INTO "order_message" ("orderId", "authorId", "authorRole", "body") VALUES ($1, NULL, 'system', 'aviso do sistema')`, [a])
    await t.query(`INSERT INTO "order_message" ("orderId", "authorId", "authorRole", "body") VALUES ($1, 'ana', 'seller', 'de outro pedido')`, [b])
    const msgs = await getOrderMessages(a)
    expect(msgs.map((m) => m.body)).toEqual(["primeira", "segunda", "aviso do sistema"])
    expect(msgs[0].authorName).toBe("CarlosPlay")
    expect(msgs[1].authorName).toBe("AnaGames")
    expect(msgs[2].authorName).toBeNull() // mensagem do sistema, sem autor
    expect(JSON.stringify(msgs)).not.toContain("Carlos Pereira Lima")
  })
})

describe("getDisputeMessages", () => {
  async function seed() {
    const o = await addOrder({ status: "em_disputa" })
    const d = await addDispute(o)
    const add = (author: string | null, role: string, body: string, internal: boolean, at: string) =>
      t.query(`INSERT INTO "dispute_message" ("disputeId", "authorId", "authorRole", "body", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6)`, [d, author, role, body, internal, at])
    await add("comprador", "buyer", "relato do comprador", false, "2026-02-01 09:00:00")
    await add("mod", "moderator", "NOTA INTERNA: suspeita de golpe", true, "2026-02-01 09:30:00")
    await add("ana", "seller", "resposta do vendedor", false, "2026-02-01 10:00:00")
    return d
  }

  it("partes NUNCA recebem nota interna", async () => {
    const d = await seed()
    const msgs = await getDisputeMessages(d, false)
    expect(msgs.map((m) => m.body)).toEqual(["relato do comprador", "resposta do vendedor"])
    expect(JSON.stringify(msgs)).not.toContain("NOTA INTERNA")
    expect(msgs.every((m) => m.internal === false)).toBe(true)
  })

  it("moderação recebe tudo, em ordem cronológica", async () => {
    const d = await seed()
    const msgs = await getDisputeMessages(d, true)
    expect(msgs.map((m) => m.body)).toEqual(["relato do comprador", "NOTA INTERNA: suspeita de golpe", "resposta do vendedor"])
    expect(msgs[1].internal).toBe(true)
    expect(msgs[1].authorName).toBe("Usuário MOD")
    expect(JSON.stringify(msgs)).not.toContain("Moderadora Legal")
  })

  it("não mistura mensagens de outras disputas", async () => {
    const d = await seed()
    const o2 = await addOrder({ status: "em_disputa" })
    const d2 = await addDispute(o2)
    await t.query(`INSERT INTO "dispute_message" ("disputeId", "authorId", "authorRole", "body") VALUES ($1, 'comprador', 'buyer', 'outra disputa')`, [d2])
    expect((await getDisputeMessages(d, true)).map((m) => m.body)).not.toContain("outra disputa")
    expect((await getDisputeMessages(d2, true)).map((m) => m.body)).toEqual(["outra disputa"])
  })
})

/* ---------------------------------------------------------------------------
 * Disputas
 * ------------------------------------------------------------------------ */

describe("getDisputeByOrder / getDisputeDetail", () => {
  it("acham pela ordem ou pelo id; nulo quando não existe", async () => {
    const o = await addOrder({ status: "em_disputa" })
    const d = await addDispute(o, { status: "em_analise" })
    expect(await getDisputeByOrder(o)).toMatchObject({ id: d, orderId: o, status: "em_analise" })
    expect(await getDisputeDetail(d)).toMatchObject({ id: d, orderId: o, openedBy: "comprador", reason: "diferente", description: "descrição" })
    expect(await getDisputeByOrder(999)).toBeNull()
    expect(await getDisputeDetail(999)).toBeNull()
    const outro = await addOrder()
    expect(await getDisputeByOrder(outro)).toBeNull()
  })
})

describe("getDisputeQueue", () => {
  async function seed() {
    const ids: Record<string, number> = {}
    const mk = async (name: string, status: string, resolutionDue: string, createdAt: string) => {
      const o = await addOrder({ status: "em_disputa", amount: 5000, title: `Produto ${name}` })
      ids[name] = await addDispute(o, { status, resolutionDue, createdAt })
    }
    await mk("tarde", "aberta", "2026-02-10 10:00:00", "2026-02-01 08:00:00")
    await mk("cedo", "em_analise", "2026-02-05 10:00:00", "2026-02-02 08:00:00")
    await mk("fechada-velha", "resolvida_comprador", "2026-01-05 10:00:00", "2026-01-01 08:00:00")
    await mk("fechada-nova", "resolvida_vendedor", "2026-01-20 10:00:00", "2026-01-15 08:00:00")
    await mk("cancelada", "cancelada", "2026-01-25 10:00:00", "2026-01-20 08:00:00")
    return ids
  }

  it("sem opções: tudo, pelo prazo de resolução mais próximo", async () => {
    const ids = await seed()
    const q = await getDisputeQueue()
    expect(q.map((d) => d.id)).toEqual([ids["fechada-velha"], ids["fechada-nova"], ids["cancelada"], ids["cedo"], ids["tarde"]])
  })

  it("statuses filtra por inclusão; excludeStatuses por exclusão; lista vazia não filtra", async () => {
    const ids = await seed()
    expect((await getDisputeQueue({ statuses: ["aberta", "em_analise"] })).map((d) => d.id)).toEqual([ids["cedo"], ids["tarde"]])
    expect((await getDisputeQueue({ excludeStatuses: ["aberta", "em_analise"] })).map((d) => d.id).sort()).toEqual(
      [ids["fechada-velha"], ids["fechada-nova"], ids["cancelada"]].sort(),
    )
    expect(await getDisputeQueue({ statuses: [] })).toHaveLength(5)
    expect(await getDisputeQueue({ statuses: ["aberta"], excludeStatuses: ["aberta"] })).toEqual([])
  })

  it("histórico: mais recentes primeiro (por abertura), com limit e offset estáveis", async () => {
    const ids = await seed()
    const fechadas = ["resolvida_comprador", "resolvida_vendedor", "cancelada"]
    const todas = await getDisputeQueue({ statuses: fechadas, newestFirst: true })
    expect(todas.map((d) => d.id)).toEqual([ids["cancelada"], ids["fechada-nova"], ids["fechada-velha"]])
    const p1 = await getDisputeQueue({ statuses: fechadas, newestFirst: true, limit: 2 })
    const p2 = await getDisputeQueue({ statuses: fechadas, newestFirst: true, limit: 2, offset: 2 })
    expect([...p1, ...p2].map((d) => d.id)).toEqual(todas.map((d) => d.id))
  })

  it("empate no prazo desempata pelo id", async () => {
    const o1 = await addOrder({ status: "em_disputa" })
    const o2 = await addOrder({ status: "em_disputa" })
    const d1 = await addDispute(o1, { resolutionDue: "2026-02-10 10:00:00" })
    const d2 = await addDispute(o2, { resolutionDue: "2026-02-10 10:00:00" })
    expect((await getDisputeQueue()).map((d) => d.id)).toEqual([d1, d2])
  })

  it("traz o pedido e as partes com nomes públicos (nunca o legal)", async () => {
    await seed()
    const [d] = await getDisputeQueue({ statuses: ["em_analise"] })
    expect(d).toMatchObject({
      amountCents: 5000,
      productTitle: "Produto cedo",
      variantLabel: "Item",
      orderStatus: "em_disputa",
      buyerName: "CarlosPlay",
      sellerName: "AnaGames",
    })
    expect(JSON.stringify(d)).not.toContain("Pereira")
    expect(JSON.stringify(d)).not.toContain("Maria da Silva")
  })
})

describe("countDisputesExcluding", () => {
  it("conta as disputas fora dos status dados", async () => {
    for (const status of ["aberta", "em_analise", "resolvida_comprador", "resolvida_vendedor", "cancelada"]) {
      const o = await addOrder({ status: "em_disputa" })
      await addDispute(o, { status })
    }
    expect(await countDisputesExcluding(["aberta", "em_analise"])).toBe(3)
    expect(await countDisputesExcluding(["aberta"])).toBe(4)
    expect(await countDisputesExcluding(["inexistente"])).toBe(5)
  })

  it("sem disputas, zero", async () => {
    expect(await countDisputesExcluding(["aberta"])).toBe(0)
  })
})

describe("getMyOpenDisputes", () => {
  it("só disputas ABERTAS em que o usuário é parte (comprador ou vendedor)", async () => {
    const pBia = await addProduct("bia")
    const minhaCompra = await addOrder({ status: "em_disputa" })
    const minhaVenda = await addOrder({ buyer: "outro", status: "em_disputa" })
    const deOutros = await addOrder({ buyer: "outro", seller: "bia", product: pBia, status: "em_disputa" })
    const encerrada = await addOrder({ status: "em_disputa" })
    const dCompra = await addDispute(minhaCompra, { status: "aberta", createdAt: "2026-02-01 08:00:00" })
    const dVenda = await addDispute(minhaVenda, { status: "em_analise", createdAt: "2026-02-02 08:00:00", openedBy: "outro" })
    const dOutros = await addDispute(deOutros, { status: "aberta", openedBy: "outro" })
    await addDispute(encerrada, { status: "resolvida_comprador" })

    const ana = await getMyOpenDisputes("ana")
    expect(ana.map((d) => d.id)).toEqual([dVenda, dCompra]) // ana é vendedora nas duas; mais nova primeiro
    const comprador = await getMyOpenDisputes("comprador")
    expect(comprador.map((d) => d.id)).toEqual([dCompra])
    expect((await getMyOpenDisputes("outro")).map((d) => d.id)).toEqual([dVenda, dOutros]) // comprador em ambas
    expect((await getMyOpenDisputes("bia")).map((d) => d.id)).toEqual([dOutros]) // vendedora só nessa
    expect(await getMyOpenDisputes("mod")).toEqual([])
    expect(comprador[0]).toMatchObject({ orderId: minhaCompra, productTitle: "Conta Valorant", amountCents: 1000, status: "aberta" })
  })

  it("devolve no máximo 50", async () => {
    for (let i = 0; i < 52; i++) {
      const o = await addOrder({ status: "em_disputa" })
      await addDispute(o)
    }
    expect(await getMyOpenDisputes("comprador")).toHaveLength(50)
  })
})
