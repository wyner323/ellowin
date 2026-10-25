import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Aviso de queda de preço para quem favoritou um anúncio (`notifyPriceChange`): quando avisa, quando só ajusta a base,
 * o teto de um aviso por pessoa por anúncio por dia, e o que nunca deve acontecer (avisar o vendedor, avisar de anúncio
 * pausado, lançar erro sem a tabela). Banco real em memória; o envio (Resend) é um espião.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  sendMail: vi.fn(),
  captureException: vi.fn(),
  tasks: [] as Promise<unknown>[],
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
    holder.tasks.push(fn())
  },
}))
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => holder.captureException(...args),
  captureMessage: () => {},
}))

import { notifyPriceChange } from "@/lib/notify"
import { SITE_URL } from "@/lib/site"

let t: TestDb
let productId: number
let variantId: number

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

beforeEach(async () => {
  await t.query(`TRUNCATE "notification_log", "favorite", "product_variant", "product", "seller_application", "user" RESTART IDENTITY CASCADE`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('ana', 'Ana Maria da Silva', 'ana@teste.dev', 'AnaGames'), ('comprador', 'Carlos Pereira Lima', 'carlos@teste.dev', 'CarlosPlay'), ('bia', 'Bia Souza', 'bia@teste.dev', 'BiaPlay')`)
  await t.query(`INSERT INTO "seller_application" ("userId", "storeName", "status") VALUES ('ana', 'Loja da Ana', 'aprovado')`)
  productId = (await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('ana', 'conta-valorant', 'Conta Valorant', 'contas') RETURNING "id"`)).rows[0].id as number
  variantId = (await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Imortal', 10000, 3) RETURNING "id"`, [productId])).rows[0].id as number

  holder.tasks.length = 0
  holder.sendMail.mockReset()
  holder.sendMail.mockResolvedValue({ sent: true })
  holder.captureException.mockReset()
  vi.stubEnv("ELLOWIN_NOTIFY", "1")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function settle() {
  await Promise.all(holder.tasks)
  holder.tasks.length = 0
}

type MailArgs = [to: string, subject: string, html: string, label: string]
const mails = () => holder.sendMail.mock.calls as MailArgs[]

const favorite = (userId: string, baseline: number | null) =>
  t.query(`INSERT INTO "favorite" ("userId", "productId", "baselineCents") VALUES ($1, $2, $3)`, [userId, productId, baseline])
const setPrice = (cents: number) => t.query(`UPDATE "product_variant" SET "priceCents" = $2 WHERE "id" = $1`, [variantId, cents])
const baseline = async (userId: string) =>
  (await t.query(`SELECT "baselineCents" FROM "favorite" WHERE "userId" = $1 AND "productId" = $2`, [userId, productId])).rows[0]?.baselineCents as number | null | undefined

describe("notifyPriceChange", () => {
  it("preço baixou: avisa QUEM GUARDOU, com o de/para e o link do anúncio, e a base desce", async () => {
    await favorite("comprador", 10_000)
    await setPrice(8_000)
    notifyPriceChange(productId)
    await settle()
    expect(mails()).toHaveLength(1)
    const [to, subject, html] = mails()[0]
    expect(to).toBe("carlos@teste.dev")
    expect(subject).toBe("Baixou o preço: Conta Valorant")
    expect(html).toContain("100,00")
    expect(html).toContain("80,00")
    expect(html).toContain(`${SITE_URL}/produtos/conta-valorant`)
    expect(await baseline("comprador")).toBe(8_000)
  })

  it("preço igual ou maior: nenhum e-mail, e a base acompanha (sobe), para uma queda futura voltar a avisar", async () => {
    await favorite("comprador", 10_000)
    await setPrice(10_000)
    notifyPriceChange(productId)
    await settle()
    expect(holder.sendMail).not.toHaveBeenCalled()
    await setPrice(12_000)
    notifyPriceChange(productId)
    await settle()
    expect(holder.sendMail).not.toHaveBeenCalled()
    expect(await baseline("comprador")).toBe(12_000)
    await setPrice(11_000) // caiu em relação à nova base
    notifyPriceChange(productId)
    await settle()
    expect(mails()).toHaveLength(1)
    expect(mails()[0][2]).toContain("110,00")
  })

  it("no máximo um aviso de queda por pessoa por anúncio por dia, mas a base continua descendo", async () => {
    await favorite("comprador", 10_000)
    await setPrice(9_000)
    notifyPriceChange(productId)
    await settle()
    await setPrice(8_000)
    notifyPriceChange(productId)
    await settle()
    expect(mails()).toHaveLength(1)
    expect(await baseline("comprador")).toBe(8_000)
  })

  it("favorito sem base (anúncio não estava à venda): só ganha a base, sem e-mail", async () => {
    await favorite("comprador", null)
    await setPrice(9_000)
    notifyPriceChange(productId)
    await settle()
    expect(holder.sendMail).not.toHaveBeenCalled()
    expect(await baseline("comprador")).toBe(9_000)
  })

  it("avisa cada pessoa que guardou, com a base dela, e nunca o próprio vendedor", async () => {
    await favorite("comprador", 10_000)
    await favorite("bia", 12_000)
    await favorite("ana", 10_000) // o vendedor, inserido à mão (a ação não deixa)
    await setPrice(8_000)
    notifyPriceChange(productId)
    await settle()
    expect(mails().map((m) => m[0]).sort()).toEqual(["bia@teste.dev", "carlos@teste.dev"])
    expect(mails().find((m) => m[0] === "bia@teste.dev")?.[2]).toContain("120,00")
  })

  it("anúncio pausado ou sem estoque: nada muda e nada é enviado", async () => {
    await favorite("comprador", 10_000)
    await setPrice(5_000)
    await t.query(`UPDATE "product" SET "status" = 'pausado' WHERE "id" = $1`, [productId])
    notifyPriceChange(productId)
    await settle()
    await t.query(`UPDATE "product" SET "status" = 'ativo' WHERE "id" = $1`, [productId])
    await t.query(`UPDATE "product_variant" SET "stock" = 0 WHERE "id" = $1`, [variantId])
    notifyPriceChange(productId)
    await settle()
    expect(holder.sendMail).not.toHaveBeenCalled()
    expect(await baseline("comprador")).toBe(10_000)
  })

  it("quem não guardou o anúncio não recebe", async () => {
    await setPrice(5_000)
    notifyPriceChange(productId)
    await settle()
    expect(holder.sendMail).not.toHaveBeenCalled()
  })

  it("FORA da produção não envia nada nem grava reserva", async () => {
    vi.stubEnv("ELLOWIN_NOTIFY", "")
    vi.spyOn(console, "log").mockImplementation(() => {})
    await favorite("comprador", 10_000)
    await setPrice(5_000)
    notifyPriceChange(productId)
    await settle()
    expect(holder.sendMail).not.toHaveBeenCalled()
    expect((await t.query(`SELECT 1 FROM "notification_log"`)).rows).toEqual([])
  })

  // Por último: apaga a tabela (cada teste acima começa com o TRUNCATE dela).
  it("sem a tabela de favoritos (migração pendente) não faz nada e não lança", async () => {
    await t.query(`DROP TABLE "favorite" CASCADE`)
    await setPrice(5_000)
    notifyPriceChange(productId)
    await settle()
    expect(holder.sendMail).not.toHaveBeenCalled()
    expect(holder.captureException).not.toHaveBeenCalled()
  })
})
