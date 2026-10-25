import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { AUTO_RELEASE_DAYS } from "@/lib/money"
import { MAX_STOCK_AVAILABLE } from "@/lib/delivery-stock-lines"

/**
 * Entrega automática (docs/entrega-automatica.md) de ponta a ponta contra um Postgres em memória com as migrações
 * reais: cadastro de itens cifrados, compra que reserva e entrega o item na mesma transação do dinheiro, estoque derivado,
 * regras do anúncio e conciliação. A sessão, o e-mail e o cache do Next são simulados; o resto é o código de verdade.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
  notifications: [] as [string, number, unknown?][],
  lowStock: [] as number[],
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
  auth: { api: { getSession: async () => (holder.userId ? { user: { id: holder.userId } } : null) } },
}))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/server", () => ({ after: () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@vercel/blob", () => ({ del: async () => {} }))
vi.mock("@/lib/notify", () => ({
  notifyOrder: (kind: string, orderId: number, extra?: unknown) => {
    holder.notifications.push([kind, orderId, extra])
  },
  notifyLowStock: (variantId: number) => {
    holder.lowStock.push(variantId)
  },
}))

import { addStock, removeStock } from "@/app/actions/delivery-stock"
import { cancelOrder, confirmReceipt, purchase } from "@/app/actions/orders"
import { createProduct, updateProduct } from "@/app/actions/products"
import { anonymizeAccount } from "@/lib/account-deletion"
import { autoDeliveryAvailable, getProductStock, purgeAvailableStock } from "@/lib/delivery-stock"
import { runWalletReconciliation } from "@/lib/reconcile"
import { decryptField } from "@/lib/secret-box"
import { creditAvailable, withTransaction } from "@/lib/wallet"

let t: TestDb

const KEY = Buffer.alloc(32, 7).toString("base64")

beforeAll(async () => {
  vi.stubEnv("DELIVERY_ENCRYPTION_KEY", KEY)
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  vi.unstubAllEnvs()
  await t.close()
})

beforeEach(async () => {
  vi.stubEnv("DELIVERY_ENCRYPTION_KEY", KEY)
  holder.userId = null
  holder.notifications.length = 0
  holder.lowStock.length = 0
  await t.query(
    `TRUNCATE "auth_attempt", "delivery_stock_item", "wallet_transaction", "order_message", "dispute_message", "dispute", "order", "product_image", "product_variant", "product", "wallet", "seller_application", "profile", "user" RESTART IDENTITY CASCADE`,
  )
  await t.query(`SELECT setval(pg_get_serial_sequence('"order"', 'id'), 100)`)

  await addUser("seller", { seller: true })
  await addUser("other", { seller: true })
  await addUser("buyer")
  await addUser("buyer2")
  await addUser("unverified", { seller: true, emailVerified: false })
  for (const id of ["buyer", "buyer2"]) await withTransaction((c) => creditAvailable(c, id, 100_000, "deposito", "Depósito de teste"))
})

async function addUser(id: string, { seller = false, emailVerified = true } = {}) {
  await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES ($1, $1, $1 || '@teste.dev', $2)`, [id, emailVerified])
  await t.query(
    `INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "birthDate") VALUES ($1, $1, '52998224725', '11999999999', '1990-01-01')`,
    [id],
  )
  if (seller) await t.query(`INSERT INTO "seller_application" ("userId", "status", "storeSlug") VALUES ($1, 'aprovado', $1 || '-store')`, [id])
}

async function rows<T = Record<string, unknown>>(text: string, params?: unknown[]) {
  return (await t.query(text, params)).rows as T[]
}
async function one<T = Record<string, unknown>>(text: string, params?: unknown[]) {
  return (await rows<T>(text, params))[0]
}

/** Anúncio de entrega automática (ou manual) já no banco, com um item de R$ 50,00. */
async function listing(opts: { sellerId?: string; category?: string; deliveryType?: string; stock?: number } = {}) {
  const p = await one<{ id: number }>(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "deliveryType", "deliveryTime", "status")
     VALUES ($1, 'p-' || gen_random_uuid()::text, 'Gift card Steam', $2, $3, $4, 'ativo') RETURNING "id"`,
    [opts.sellerId ?? "seller", opts.category ?? "gift-cards", opts.deliveryType ?? "automatica", opts.deliveryType === "manual" ? "Até 24 horas" : "Imediata (entrega automática)"],
  )
  const v = await one<{ id: number }>(
    `INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'R$ 50', 5000, $2) RETURNING "id"`,
    [p.id, opts.stock ?? 0],
  )
  return { productId: p.id, variantId: v.id }
}

async function stock(variantId: number, items: string[], as = "seller") {
  holder.userId = as
  const result = await addStock(variantId, items.join("\n"))
  expect(result.ok, result.error).toBe(true)
  return result
}

const stockOf = async (variantId: number) => (await one<{ stock: number }>(`SELECT "stock" FROM "product_variant" WHERE "id" = $1`, [variantId])).stock
const wallet = (id: string) => one<{ availableCents: number; heldCents: number }>(`SELECT "availableCents", "heldCents" FROM "wallet" WHERE "userId" = $1`, [id])
const orderRow = (id: number) =>
  one<{ status: string; deliveryPayload: string | null; deliveredAt: Date | null; autoReleaseAt: Date | null; deliveryDueAt: Date | null }>(`SELECT * FROM "order" WHERE "id" = $1`, [id])

async function buy(variantId: number, as = "buyer") {
  holder.userId = as
  return purchase(variantId, 5000)
}

describe("cadastro de itens (addStock)", () => {
  it("cifra cada item, guarda só a máscara legível, e o estoque do anúncio passa a ser o número de itens", async () => {
    const { variantId } = await listing()
    const result = await stock(variantId, ["GIFT-AAAA-1111-ZZ", "GIFT-BBBB-2222-YY", "GIFT-CCCC-3333-XX"])
    expect(result.message).toContain("3 itens cadastrados")
    expect(await stockOf(variantId)).toBe(3)

    const items = await rows<{ payload: string; mask: string; payloadHash: string; orderId: number | null }>(`SELECT * FROM "delivery_stock_item" WHERE "variantId" = $1 ORDER BY "id"`, [variantId])
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item.payload.startsWith("enc:v1:")).toBe(true)
      expect(item.payload).not.toContain("GIFT")
      expect(item.mask).toMatch(/^GI••••[A-Z]{2}$/)
      expect(item.payloadHash).toMatch(/^[0-9a-f]{64}$/)
      expect(item.orderId).toBeNull()
    }
    expect(decryptField(items[0].payload, `stock:${variantId}`)).toBe("GIFT-AAAA-1111-ZZ")
  })

  it("item repetido (no envio ou já cadastrado) é ignorado e avisado", async () => {
    const { variantId } = await listing()
    await stock(variantId, ["CODE-0001-AAAA"])
    holder.userId = "seller"
    const r = await addStock(variantId, "CODE-0001-AAAA\nCODE-0002-BBBB\nCODE-0002-BBBB")
    expect(r.ok).toBe(true)
    expect(r.message).toContain("1 item cadastrado")
    expect(r.message).toContain("2 repetidos foram ignorados")
    expect(await stockOf(variantId)).toBe(2)
  })

  it("linha ruim recusa o envio inteiro, com o número da linha, e nada é gravado", async () => {
    const { variantId } = await listing()
    holder.userId = "seller"
    const r = await addStock(variantId, "CODE-0001-AAAA\nabc\nenc:v1:forjado")
    expect(r).toMatchObject({ ok: false, field: "items" })
    expect(r.error).toContain("Linha 2")
    expect(r.error).toContain("Linha 3")
    expect(await rows(`SELECT 1 FROM "delivery_stock_item"`)).toHaveLength(0)
  })

  it("só o dono, só vendedor aprovado, só anúncio automático de categoria permitida", async () => {
    const mine = await listing()
    holder.userId = "other"
    expect(await addStock(mine.variantId, "CODE-0001-AAAA")).toMatchObject({ ok: false, error: expect.stringContaining("não encontrado") })

    holder.userId = "buyer"
    expect(await addStock(mine.variantId, "CODE-0001-AAAA")).toMatchObject({ ok: false })

    const manual = await listing({ deliveryType: "manual" })
    holder.userId = "seller"
    expect(await addStock(manual.variantId, "CODE-0001-AAAA")).toMatchObject({ ok: false, error: expect.stringContaining("não é de entrega automática") })

    const moedas = await listing({ category: "moedas" })
    expect(await addStock(moedas.variantId, "CODE-0001-AAAA")).toMatchObject({ ok: false, error: expect.stringContaining("categoria") })
    expect(await rows(`SELECT 1 FROM "delivery_stock_item"`)).toHaveLength(0)
  })

  it("e-mail não confirmado não cadastra itens", async () => {
    const { variantId } = await listing({ sellerId: "unverified" })
    holder.userId = "unverified"
    expect(await addStock(variantId, "CODE-0001-AAAA")).toMatchObject({ ok: false, field: "email" })
  })

  it("sem a chave de cifra o cadastro é recusado (nunca grava código em texto puro)", async () => {
    const { variantId } = await listing()
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", "")
    holder.userId = "seller"
    const r = await addStock(variantId, "CODE-0001-AAAA")
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("armazenamento seguro") })
    expect(await rows(`SELECT 1 FROM "delivery_stock_item"`)).toHaveLength(0)
  })

  it("teto de itens disponíveis por item do anúncio", async () => {
    const { variantId } = await listing()
    await t.query(
      `INSERT INTO "delivery_stock_item" ("variantId", "sellerId", "payload", "payloadHash", "mask")
       SELECT $1, 'seller', 'x', 'h' || g, '••••••' FROM generate_series(1, $2) g`,
      [variantId, MAX_STOCK_AVAILABLE - 1],
    )
    holder.userId = "seller"
    expect(await addStock(variantId, "CODE-0001-AAAA\nCODE-0002-BBBB")).toMatchObject({ ok: false, error: expect.stringContaining("até 10.000") })
    expect(await addStock(variantId, "CODE-0001-AAAA")).toMatchObject({ ok: true })
  })

  it("limite de 30 envios por hora", async () => {
    const { variantId } = await listing()
    holder.userId = "seller"
    for (let i = 0; i < 30; i++) await addStock(variantId, `CODE-${String(i).padStart(4, "0")}-AAAA`)
    expect(await addStock(variantId, "CODE-9999-AAAA")).toMatchObject({ ok: false, error: expect.stringContaining("Muitos envios") })
  })
})

describe("compra com entrega automática", () => {
  it("entrega o item na hora, na mesma transação do dinheiro: pedido entregue, dados cifrados para o pedido, item marcado vendido", async () => {
    const { variantId } = await listing()
    await stock(variantId, ["GIFT-AAAA-1111-ZZ", "GIFT-BBBB-2222-YY"])

    const r = await buy(variantId)
    expect(r.ok, r.error).toBe(true)
    expect(r.message).toContain("já estão no pedido")
    const order = await orderRow(r.orderId!)

    expect(order.status).toBe("entregue")
    expect(order.deliveredAt).not.toBeNull()
    expect(order.deliveryDueAt).toBeNull()
    expect(decryptField(order.deliveryPayload!, `order:${r.orderId}`)).toBe("GIFT-AAAA-1111-ZZ") // o mais antigo primeiro
    const days = (order.autoReleaseAt!.getTime() - order.deliveredAt!.getTime()) / 86_400_000
    expect(days).toBeCloseTo(AUTO_RELEASE_DAYS, 3)

    const item = await one<{ orderId: number; payload: string | null; soldAt: Date | null }>(`SELECT * FROM "delivery_stock_item" WHERE "orderId" = $1`, [r.orderId])
    expect(item.payload).toBeNull() // o conteúdo SAIU do estoque
    expect(item.soldAt).not.toBeNull()
    expect(await stockOf(variantId)).toBe(1)
    expect((await wallet("buyer")).heldCents).toBe(5000)
    // Um único aviso, já dizendo que foi entregue (não manda também "pedido entregue").
    expect(holder.notifications).toEqual([["order_created", r.orderId!, { automatic: true }]])
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM "order_message" WHERE "orderId" = $1 AND "authorRole" = 'system'`, [r.orderId])).n).toBe(1)
  })

  it("dois compradores recebem itens diferentes", async () => {
    const { variantId } = await listing()
    await stock(variantId, ["GIFT-AAAA-1111-ZZ", "GIFT-BBBB-2222-YY"])
    const a = await buy(variantId, "buyer")
    const b = await buy(variantId, "buyer2")
    const [pa, pb] = [await orderRow(a.orderId!), await orderRow(b.orderId!)]
    expect(new Set([decryptField(pa.deliveryPayload!, `order:${a.orderId}`), decryptField(pb.deliveryPayload!, `order:${b.orderId}`)]).size).toBe(2)
    expect(await stockOf(variantId)).toBe(0)
  })

  it("acabou o estoque: recusa 'Item esgotado', sem pedido e sem cobrar", async () => {
    const { variantId } = await listing()
    await stock(variantId, ["GIFT-AAAA-1111-ZZ"])
    expect((await buy(variantId, "buyer")).ok).toBe(true)

    const r = await buy(variantId, "buyer2")
    expect(r).toMatchObject({ ok: false, error: "Item esgotado." })
    expect((await wallet("buyer2")).availableCents).toBe(100_000)
    expect((await wallet("buyer2")).heldCents).toBe(0)
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM "order" WHERE "buyerId" = 'buyer2'`)).n).toBe(0)
  })

  it("estoque diz que há mas não há item (divergência): a compra inteira desfaz, nada é cobrado nem vendido", async () => {
    const { variantId } = await listing({ stock: 5 }) // 5 no campo, 0 itens de verdade
    const r = await buy(variantId)
    expect(r).toMatchObject({ ok: false, error: "Item esgotado." })
    expect((await wallet("buyer")).heldCents).toBe(0)
    expect(await stockOf(variantId)).toBe(5)
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM "order"`)).n).toBe(0)
  })

  it("anúncio manual segue igual: pedido aguardando entrega, sem tocar no estoque de itens", async () => {
    const { variantId } = await listing({ deliveryType: "manual", stock: 2 })
    const r = await buy(variantId)
    expect(r.ok).toBe(true)
    expect(r.message).toBe("Compra realizada. O valor ficou em custódia.")
    expect((await orderRow(r.orderId!)).status).toBe("aguardando_entrega")
    expect(await stockOf(variantId)).toBe(1)
    expect(holder.notifications).toEqual([["order_created", r.orderId!, { automatic: false }]])
  })

  it("o comprador confirma e o vendedor recebe; o item continua vendido e nada volta ao estoque", async () => {
    const { variantId } = await listing()
    await stock(variantId, ["GIFT-AAAA-1111-ZZ"])
    const r = await buy(variantId)
    holder.userId = "buyer"
    expect((await confirmReceipt(r.orderId!)).ok).toBe(true)
    expect((await wallet("seller")).availableCents).toBeGreaterThan(0)
    expect(await stockOf(variantId)).toBe(0)
    expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM "delivery_stock_item" WHERE "orderId" IS NULL`)).n).toBe(0)
  })

  it("pedido automático não pode ser cancelado (já foi entregue) e o estoque não muda", async () => {
    const { variantId } = await listing()
    await stock(variantId, ["GIFT-AAAA-1111-ZZ", "GIFT-BBBB-2222-YY"])
    const r = await buy(variantId)
    holder.userId = "buyer"
    expect(await cancelOrder(r.orderId!)).toMatchObject({ ok: false })
    holder.userId = "seller"
    expect(await cancelOrder(r.orderId!)).toMatchObject({ ok: false })
    expect(await stockOf(variantId)).toBe(1)
  })

  it("um código já vendido não pode ser cadastrado de novo", async () => {
    const { variantId } = await listing()
    await stock(variantId, ["GIFT-AAAA-1111-ZZ"])
    await buy(variantId)
    holder.userId = "seller"
    const r = await addStock(variantId, "GIFT-AAAA-1111-ZZ")
    expect(r.message).toContain("0 itens cadastrados")
    expect(await stockOf(variantId)).toBe(0)
  })

  it("a conciliação do dinheiro e do estoque fecha depois das compras", async () => {
    const { variantId } = await listing()
    await stock(variantId, ["GIFT-AAAA-1111-ZZ", "GIFT-BBBB-2222-YY"])
    await buy(variantId, "buyer")
    await buy(variantId, "buyer2")
    const report = await runWalletReconciliation()
    expect(report.findings.map((f) => f.check)).toEqual([])
  })
})

describe("remoção e leitura do estoque", () => {
  it("remove item disponível e acerta o estoque; item vendido e item alheio não saem", async () => {
    const { variantId } = await listing()
    await stock(variantId, ["GIFT-AAAA-1111-ZZ", "GIFT-BBBB-2222-YY", "GIFT-CCCC-3333-XX"])
    const sold = await buy(variantId)
    const soldItem = (await one<{ id: number }>(`SELECT "id" FROM "delivery_stock_item" WHERE "orderId" = $1`, [sold.orderId])).id
    const free = (await one<{ id: number }>(`SELECT "id" FROM "delivery_stock_item" WHERE "orderId" IS NULL ORDER BY "id" LIMIT 1`)).id

    holder.userId = "other"
    expect(await removeStock(free)).toMatchObject({ ok: false })
    holder.userId = "seller"
    expect(await removeStock(soldItem)).toMatchObject({ ok: false, error: expect.stringContaining("já vendido") })
    expect(await removeStock(free)).toMatchObject({ ok: true })
    expect(await stockOf(variantId)).toBe(1)
  })

  it("getProductStock devolve contagens e só a máscara, nunca o conteúdo; de outro vendedor devolve vazio", async () => {
    const { productId, variantId } = await listing()
    await stock(variantId, ["GIFT-AAAA-1111-ZZ", "GIFT-BBBB-2222-YY"])
    await buy(variantId)
    const summary = await getProductStock("seller", productId)
    expect(summary).toHaveLength(1)
    expect(summary![0]).toMatchObject({ available: 1, sold: 1 })
    expect(JSON.stringify(summary)).not.toContain("GIFT-BBBB-2222-YY")
    expect(summary![0].items[0].mask).toBe("GI••••YY")
    expect(await getProductStock("other", productId)).toEqual([])
  })

  it("LGPD: anonimizar a conta do vendedor remove só os itens ainda não vendidos", async () => {
    const { variantId } = await listing()
    await stock(variantId, ["GIFT-AAAA-1111-ZZ", "GIFT-BBBB-2222-YY"])
    await buy(variantId)
    await anonymizeAccount("seller")
    const left = await rows<{ orderId: number | null }>(`SELECT "orderId" FROM "delivery_stock_item"`)
    expect(left).toHaveLength(1)
    expect(left[0].orderId).not.toBeNull()
  })
})

describe("regras do anúncio", () => {
  const input = (over: Record<string, unknown> = {}) => ({
    title: "Gift card Roblox entrega imediata",
    categorySlug: "gift-cards",
    game: "Roblox", // sem campos obrigatórios por jogo (Steam exige a região)
    description: "Cartão digital com o código entregue na hora, depois da compra.",
    deliveryType: "automatica",
    deliveryTime: "",
    variants: [{ label: "R$ 50", price: "50,00", stock: "99" }],
    ...over,
  })

  it("cria anúncio automático com estoque zero (o campo do formulário é ignorado) e orienta cadastrar os itens", async () => {
    holder.userId = "seller"
    const r = await createProduct(input() as Parameters<typeof createProduct>[0])
    expect(r.ok, r.error).toBe(true)
    expect(r.message).toContain("Cadastre os itens")
    const v = await one<{ stock: number }>(`SELECT v."stock" FROM "product_variant" v JOIN "product" p ON p."id" = v."productId" WHERE p."slug" = $1`, [r.slug])
    expect(v.stock).toBe(0)
  })

  it("recusa entrega automática em categoria que não aceita", async () => {
    holder.userId = "seller"
    const r = await createProduct(input({ categorySlug: "moedas", game: "Roblox" }) as Parameters<typeof createProduct>[0])
    expect(r).toMatchObject({ ok: false, field: "deliveryType", error: expect.stringContaining("gift cards e contas") })
  })

  it("sem a chave de cifra a opção fica desligada (não promete o que não entrega)", async () => {
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", "")
    expect(await autoDeliveryAvailable()).toBe(false)
    holder.userId = "seller"
    const r = await createProduct(input() as Parameters<typeof createProduct>[0])
    expect(r).toMatchObject({ ok: false, field: "deliveryType", error: expect.stringContaining("ainda não está disponível") })
  })

  it("editar não mexe no estoque dos itens de um anúncio automático", async () => {
    const { productId, variantId } = await listing()
    await stock(variantId, ["GIFT-AAAA-1111-ZZ", "GIFT-BBBB-2222-YY"])
    holder.userId = "seller"
    const r = await updateProduct({
      productId,
      ...input({ variants: [{ id: variantId, label: "R$ 50", price: "55,00", stock: "999" }] }),
    } as Parameters<typeof updateProduct>[0])
    expect(r.ok, r.error).toBe(true)
    expect(await stockOf(variantId)).toBe(2)
    expect((await one<{ priceCents: number }>(`SELECT "priceCents" FROM "product_variant" WHERE "id" = $1`, [variantId])).priceCents).toBe(5500)
  })

  it("não deixa voltar para manual com itens no estoque; depois de apagá-los, deixa", async () => {
    const { productId, variantId } = await listing()
    await stock(variantId, ["GIFT-AAAA-1111-ZZ"])
    const manual = (over = {}) =>
      ({ productId, ...input({ deliveryType: "manual", deliveryTime: "Até 24 horas", variants: [{ id: variantId, label: "R$ 50", price: "50,00", stock: "3" }], ...over }) }) as Parameters<typeof updateProduct>[0]
    holder.userId = "seller"
    expect(await updateProduct(manual())).toMatchObject({ ok: false, error: expect.stringContaining("Apague os itens") })

    const itemId = (await one<{ id: number }>(`SELECT "id" FROM "delivery_stock_item"`)).id
    expect((await removeStock(itemId)).ok).toBe(true)
    expect((await updateProduct(manual())).ok).toBe(true)
    expect(await stockOf(variantId)).toBe(3) // manual de novo: vale o número do formulário
  })

  it("passar de manual para automático zera o estoque manual (ainda não há itens)", async () => {
    const { productId, variantId } = await listing({ deliveryType: "manual", stock: 4 })
    holder.userId = "seller"
    const r = await updateProduct({ productId, ...input({ variants: [{ id: variantId, label: "R$ 50", price: "50,00", stock: "4" }] }) } as Parameters<typeof updateProduct>[0])
    expect(r.ok, r.error).toBe(true)
    expect(await stockOf(variantId)).toBe(0)
  })
})

describe("conciliação do estoque automático", () => {
  it("avisa quando o estoque do anúncio diverge dos itens disponíveis", async () => {
    const { variantId } = await listing()
    await stock(variantId, ["GIFT-AAAA-1111-ZZ"])
    await t.query(`UPDATE "product_variant" SET "stock" = 7 WHERE "id" = $1`, [variantId])
    const report = await runWalletReconciliation()
    expect(report.findings.map((f) => f.check)).toContain("estoque_automatico_divergente")
  })

  it("avisa quando um item vendido aponta para pedido ainda aguardando entrega", async () => {
    const { variantId } = await listing()
    await stock(variantId, ["GIFT-AAAA-1111-ZZ"])
    const r = await buy(variantId)
    await t.query(`UPDATE "order" SET "status" = 'aguardando_entrega' WHERE "id" = $1`, [r.orderId])
    const report = await runWalletReconciliation()
    expect(report.findings.map((f) => f.check)).toContain("estoque_vendido_sem_pedido_valido")
  })
})

describe("migração 0011 ainda não aplicada", () => {
  // Por último: apaga a tabela para o resto do arquivo (cada teste acima recria o estado pelo TRUNCATE).
  it("conciliação, leitura do painel e a opção de entrega automática toleram a falta da tabela", async () => {
    await t.query(`DROP TABLE "delivery_stock_item" CASCADE`)
    expect(await autoDeliveryAvailable()).toBe(false)
    expect(await getProductStock("seller", 1)).toBeNull()
    await withTransaction((c) => purgeAvailableStock(c, "seller")) // não lança
    const report = await runWalletReconciliation()
    expect(report.findings.map((f) => f.check)).toEqual([])

    // E um anúncio "automático" antigo continua vendendo como antes (aguardando entrega, entrega à mão) até a migração converter.
    const { variantId } = await listing({ stock: 2 })
    const r = await buy(variantId)
    expect(r.ok, r.error).toBe(true)
    expect(r.message).toBe("Compra realizada. O valor ficou em custódia.")
    expect((await orderRow(r.orderId!)).status).toBe("aguardando_entrega")
    expect(await stockOf(variantId)).toBe(1)
  })
})
