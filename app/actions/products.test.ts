import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { INSTANT_DELIVERY_TIME } from "@/lib/delivery"
import { MAX_DESCRIPTION, MAX_TITLE } from "@/lib/listing-checks"

/**
 * Server actions de anúncio (criar, editar, pausar/reativar) contra um Postgres
 * em memória com as migrações reais. A sessão, o cache do Next e o Vercel Blob
 * são simulados; o resto (regras de vendedor, e-mail e cadastro, validação,
 * variantes, fotos e atributos por jogo) é o código de verdade.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
  deleted: [] as string[][],
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
vi.mock("@vercel/blob", () => ({
  del: async (urls: string[]) => {
    holder.deleted.push(urls)
  },
}))

import { createProduct, toggleProductStatus, updateProduct } from "@/app/actions/products"

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
  holder.deleted.length = 0
  await t.query(
    `TRUNCATE "order", "product_image", "product_variant", "product", "seller_application", "profile", "user" RESTART IDENTITY CASCADE`,
  )
  await addUser("ana", { seller: "aprovado" })
  await addUser("bia", { seller: "aprovado" })
  await addUser("cadu") // usuário comum, nunca virou vendedor
  await addUser("pendente", { seller: "em_andamento" })
  await addUser("sem-email", { seller: "aprovado", emailVerified: false })
  await addUser("sem-perfil", { seller: "aprovado", profile: false })
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

async function addUser(
  id: string,
  { seller, emailVerified = true, profile = true }: { seller?: string; emailVerified?: boolean; profile?: boolean } = {},
) {
  await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES ($1, $1, $1 || '@teste.dev', $2)`, [id, emailVerified])
  if (profile) {
    await t.query(
      `INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "birthDate") VALUES ($1, $1, '52998224725', '11999999999', '1990-01-01')`,
      [id],
    )
  }
  if (seller) await t.query(`INSERT INTO "seller_application" ("userId", "status", "storeSlug") VALUES ($1, $2, $1 || '-store')`, [id, seller])
}

type Input = Parameters<typeof createProduct>[0]

const valid = (over: Partial<Input> = {}): Input => ({
  title: "Robux com entrega rápida via gamepass",
  categorySlug: "moedas",
  game: "Roblox",
  description: "Entrego os Robux pelo gamepass em poucos minutos, com chat aberto.",
  deliveryType: "manual",
  deliveryTime: "Até 24 horas",
  variants: [{ label: "1.000 Robux", price: "49,90", stock: "10" }],
  ...over,
})

async function rows(text: string, params?: unknown[]) {
  return (await t.query(text, params)).rows
}

async function productRow(id: number) {
  return (await rows(`SELECT * FROM "product" WHERE "id" = $1`, [id]))[0] as {
    id: number
    sellerId: string
    slug: string
    title: string
    categorySlug: string
    game: string | null
    deliveryType: string
    deliveryTime: string
    accountOrigin: string | null
    attributes: Record<string, string>
    status: string
    salesCount: number
    ratingCount: number
  }
}

const variantsOf = (productId: number) =>
  rows(`SELECT "id", "label", "priceCents", "stock", "active", "deliveryNote" FROM "product_variant" WHERE "productId" = $1 ORDER BY "sortOrder", "id"`, [
    productId,
  ]) as Promise<{ id: number; label: string; priceCents: number; stock: number; active: boolean; deliveryNote: string | null }[]>

const imagesOf = async (productId: number) =>
  (await rows(`SELECT "url" FROM "product_image" WHERE "productId" = $1 ORDER BY "sortOrder"`, [productId])).map((r) => r.url as string)

const productCount = async () => (await rows(`SELECT count(*)::int AS n FROM "product"`))[0].n as number

/** Cria como `ana` e devolve o id do anúncio. */
async function create(over: Partial<Input> = {}, as = "ana") {
  holder.userId = as
  const result = await createProduct(valid(over))
  expect(result.ok, result.error).toBe(true)
  return (await rows(`SELECT "id", "slug" FROM "product" WHERE "slug" = $1`, [result.slug]))[0] as { id: number; slug: string }
}

const blob = (user: string, file: string) => `https://abc123.public.blob.vercel-storage.com/produtos/${user}/${file}`

/* ---------------------------------------------------------------------------
 * createProduct — quem pode e o que fica gravado
 * ------------------------------------------------------------------------ */

describe("createProduct: quem pode anunciar", () => {
  it("exige estar logado", async () => {
    holder.userId = null
    await expect(createProduct(valid())).rejects.toThrow("Não autenticado")
    expect(await productCount()).toBe(0)
  })

  it("só vendedor aprovado anuncia", async () => {
    for (const who of ["cadu", "pendente"]) {
      holder.userId = who
      expect(await createProduct(valid()), who).toMatchObject({ ok: false, error: expect.stringContaining("cadastro de vendedor") })
    }
    expect(await productCount()).toBe(0)
  })

  it("exige e-mail confirmado e cadastro completo", async () => {
    holder.userId = "sem-email"
    expect(await createProduct(valid())).toMatchObject({ ok: false, field: "email" })
    holder.userId = "sem-perfil"
    expect(await createProduct(valid())).toMatchObject({ ok: false, field: "profile" })
    expect(await productCount()).toBe(0)
  })
})

describe("createProduct: o que é gravado", () => {
  it("o dono, o status e os contadores vêm do servidor, não do cliente", async () => {
    holder.userId = "ana"
    const hostile = { ...valid(), sellerId: "bia", status: "pausado", salesCount: 9_999, ratingSum: 50, ratingCount: 10 } as Input
    const result = await createProduct(hostile)
    expect(result.ok).toBe(true)

    const p = (await rows(`SELECT * FROM "product"`))[0] as Awaited<ReturnType<typeof productRow>>
    expect(p).toMatchObject({ sellerId: "ana", status: "ativo", salesCount: 0, ratingCount: 0 })
  })

  it("grava título, jogo (sem espaços nas pontas), preço em centavos e estoque", async () => {
    const { id } = await create({ title: "  Robux entrega imediata  ", game: "  Roblox  ", variants: [{ label: " 1.000 Robux ", price: "1.234,56", stock: "7", deliveryNote: " via gamepass " }] })

    expect(await productRow(id)).toMatchObject({ title: "Robux entrega imediata", game: "Roblox", categorySlug: "moedas" })
    expect(await variantsOf(id)).toEqual([
      expect.objectContaining({ label: "1.000 Robux", priceCents: 123_456, stock: 7, active: true, deliveryNote: "via gamepass" }),
    ])
  })

  it("gera slug sem acento nem símbolos e nunca repete", async () => {
    const a = await create({ title: "Conta Valorant — Imortal 2 (açaí!)" })
    const b = await create({ title: "Conta Valorant — Imortal 2 (açaí!)" })
    const c = await create({ title: "Conta Valorant — Imortal 2 (açaí!)" })

    expect(a.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(new Set([a.slug, b.slug, c.slug]).size).toBe(3)
    expect(b.slug).toBe(`${a.slug}-2`)
  })

  it("o slug acha o primeiro número livre numa só consulta e ignora slugs parecidos que não são o mesmo título", async () => {
    const a = await create({ title: "Conta Fortnite" })
    // "-2" some (anúncio apagado): o próximo é o -2 de novo, e "-3" já tomado continua sendo respeitado
    await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('ana', $1, 'x', 'contas')`, [`${a.slug}-3`])
    // parecidos que NÃO contam: sufixo não numérico e outro título que começa igual
    await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('ana', $1, 'x', 'contas')`, [`${a.slug}-ps5`])
    await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('ana', $1, 'x', 'contas')`, [`${a.slug}-2-extra`])

    const b = await create({ title: "Conta Fortnite" })
    expect(b.slug).toBe(`${a.slug}-2`)
    const c = await create({ title: "Conta Fortnite" })
    expect(c.slug).toBe(`${a.slug}-4`)
  })

  it("jogo em branco vira nulo", async () => {
    const { id } = await create({ game: "   " })
    expect((await productRow(id)).game).toBeNull()
  })
})

describe("createProduct: entrega", () => {
  it("entrega automática sempre vira 'imediata', mesmo que o cliente mande outro prazo", async () => {
    const { id } = await create({ deliveryType: "automatica", deliveryTime: "Até 72 horas" })
    expect(await productRow(id)).toMatchObject({ deliveryType: "automatica", deliveryTime: INSTANT_DELIVERY_TIME })
  })

  it("tipo de entrega desconhecido cai em manual", async () => {
    const { id } = await create({ deliveryType: "teletransporte" })
    expect((await productRow(id)).deliveryType).toBe("manual")
  })

  it("prazo manual precisa ser um dos da lista (sem prazo real o reembolso por atraso não dispara)", async () => {
    holder.userId = "ana"
    expect(await createProduct(valid({ deliveryTime: "quando eu puder" }))).toMatchObject({ ok: false, field: "deliveryTime" })
    expect(await productCount()).toBe(0)
  })

  it("prazo manual em branco usa o padrão", async () => {
    const { id } = await create({ deliveryTime: "   " })
    expect((await productRow(id)).deliveryTime).toBe("Até 24 horas")
  })
})

/* ---------------------------------------------------------------------------
 * createProduct — validação
 * ------------------------------------------------------------------------ */

describe("createProduct: validação de texto", () => {
  it("título: mínimo de 8 e máximo permitido", async () => {
    holder.userId = "ana"
    expect(await createProduct(valid({ title: "curto" }))).toMatchObject({ ok: false, field: "title" })
    expect(await createProduct(valid({ title: "x".repeat(MAX_TITLE + 1) }))).toMatchObject({ ok: false, field: "title" })
    expect((await createProduct(valid({ title: "x".repeat(MAX_TITLE) }))).ok).toBe(true)
  })

  it("descrição: mínimo de 20 e máximo permitido", async () => {
    holder.userId = "ana"
    expect(await createProduct(valid({ description: "curta demais" }))).toMatchObject({ ok: false, field: "description" })
    expect(await createProduct(valid({ description: "d".repeat(MAX_DESCRIPTION + 1) }))).toMatchObject({ ok: false, field: "description" })
    expect((await createProduct(valid({ description: "d".repeat(MAX_DESCRIPTION) }))).ok).toBe(true)
  })

  it("jogo com mais de 80 caracteres e categoria vazia", async () => {
    holder.userId = "ana"
    expect(await createProduct(valid({ game: "j".repeat(81) }))).toMatchObject({ ok: false, field: "game" })
    expect(await createProduct(valid({ categorySlug: "" }))).toMatchObject({ ok: false, field: "categorySlug" })
  })
})

describe("createProduct: procedência da conta", () => {
  it("conta exige procedência válida", async () => {
    holder.userId = "ana"
    expect(await createProduct(valid({ categorySlug: "contas" }))).toMatchObject({ ok: false, field: "accountOrigin" })
    expect(await createProduct(valid({ categorySlug: "contas", accountOrigin: "inventada" }))).toMatchObject({ ok: false, field: "accountOrigin" })
    expect(await productCount()).toBe(0)
  })

  it("com procedência válida grava; em outras categorias o valor é descartado", async () => {
    const conta = await create({ categorySlug: "contas", accountOrigin: "criador_sem_recuperacao" })
    expect((await productRow(conta.id)).accountOrigin).toBe("criador_sem_recuperacao")

    const moeda = await create({ categorySlug: "moedas", accountOrigin: "criador_sem_recuperacao" })
    expect((await productRow(moeda.id)).accountOrigin).toBeNull()
  })
})

describe("createProduct: itens (variantes)", () => {
  const bad = async (variants: Input["variants"], expected: string) => {
    holder.userId = "ana"
    const result = await createProduct(valid({ variants }))
    expect(result, expected).toMatchObject({ ok: false, field: "variants" })
    expect(result.error, expected).toContain(expected)
  }

  it("exige ao menos um item, com nome", async () => {
    await bad([], "pelo menos um item")
    await bad([{ label: "a", price: "10,00", stock: "1" }], "Dê um nome")
    await bad([{ label: "n".repeat(81), price: "10,00", stock: "1" }], "80 caracteres")
  })

  it("preço: mínimo R$ 1,00, máximo R$ 100.000,00, e texto que não é número", async () => {
    await bad([{ label: "Item", price: "0,99", stock: "1" }], "no mínimo R$ 1,00")
    await bad([{ label: "Item", price: "abc", stock: "1" }], "no mínimo R$ 1,00")
    await bad([{ label: "Item", price: "-5", stock: "1" }], "no mínimo R$ 1,00")
    await bad([{ label: "Item", price: "100.000,01", stock: "1" }], "máximo")
    holder.userId = "ana"
    expect((await createProduct(valid({ variants: [{ label: "Item", price: "100.000,00", stock: "1" }] }))).ok).toBe(true)
  })

  it("estoque: inteiro de 0 a 100.000", async () => {
    await bad([{ label: "Item", price: "10,00", stock: "-1" }], "estoque")
    await bad([{ label: "Item", price: "10,00", stock: "abc" }], "estoque")
    await bad([{ label: "Item", price: "10,00", stock: "100001" }], "estoque")
    holder.userId = "ana"
    expect((await createProduct(valid({ variants: [{ label: "Item", price: "10,00", stock: "0" }] }))).ok).toBe(true)
  })

  it("observação de entrega com mais de 200 caracteres é recusada", async () => {
    await bad([{ label: "Item", price: "10,00", stock: "1", deliveryNote: "n".repeat(201) }], "200 caracteres")
  })

  it("um item inválido no meio recusa o anúncio inteiro e não deixa nada pela metade", async () => {
    await bad(
      [
        { label: "Bom", price: "10,00", stock: "1" },
        { label: "Ruim", price: "0,10", stock: "1" },
      ],
      "Ruim",
    )
    expect(await productCount()).toBe(0)
    expect((await rows(`SELECT count(*)::int AS n FROM "product_variant"`))[0].n).toBe(0)
  })
})

describe("createProduct: fotos", () => {
  it("guarda só as fotos do próprio vendedor, sem repetir, na ordem e até 5", async () => {
    const own = ["a", "b", "c", "d", "e", "f"].map((n) => blob("ana", `${n}.webp`))
    const { id } = await create({
      images: [
        own[0],
        own[0], // repetida
        blob("bia", "alheia.webp"), // de outro vendedor
        "https://evil.example.com/produtos/ana/x.webp", // domínio de fora
        "http://abc.public.blob.vercel-storage.com/produtos/ana/http.webp", // sem https
        ...own.slice(1),
      ],
    })

    expect(await imagesOf(id)).toEqual(own.slice(0, 5))
  })

  it("sem fotos é permitido", async () => {
    const { id } = await create({ images: undefined })
    expect(await imagesOf(id)).toEqual([])
  })
})

describe("createProduct: atributos do jogo", () => {
  it("Valorant (conta) exige região e rank", async () => {
    holder.userId = "ana"
    const base = valid({ categorySlug: "contas", game: "Valorant", accountOrigin: "criador_sem_recuperacao" })

    const semNada = await createProduct(base)
    expect(semNada).toMatchObject({ ok: false, field: "attributes" })
    expect(semNada.error).toContain("Região")

    const soRegiao = await createProduct({ ...base, attributes: { regiao: "br" } })
    expect(soRegiao).toMatchObject({ ok: false, field: "attributes" })
    expect(soRegiao.error).toContain("Rank")
    expect(await productCount()).toBe(0)
  })

  it("grava só chaves e valores da definição", async () => {
    const { id } = await create({
      categorySlug: "contas",
      game: "Valorant",
      accountOrigin: "criador_sem_recuperacao",
      attributes: { regiao: "br", rank: "imortal", skins: "999", hack: "<script>" },
    })
    expect((await productRow(id)).attributes).toEqual({ regiao: "br", rank: "imortal" })
  })

  it("jogo sem definição ou categoria sem campos não guarda atributo nenhum", async () => {
    const roblox = await create({ attributes: { rank: "imortal" } })
    expect((await productRow(roblox.id)).attributes).toEqual({})

    const moedaValorant = await create({ game: "Valorant", categorySlug: "moedas", attributes: { rank: "ouro" } })
    expect((await productRow(moedaValorant.id)).attributes).toEqual({})
  })

  it("Steam (gift card) exige região", async () => {
    holder.userId = "ana"
    expect(await createProduct(valid({ game: "Steam", categorySlug: "gift-cards" }))).toMatchObject({ ok: false, field: "attributes" })
    const { id } = await create({ game: "Steam", categorySlug: "gift-cards", attributes: { regiao: "br" } })
    expect((await productRow(id)).attributes).toEqual({ regiao: "br" })
  })
})

/* ---------------------------------------------------------------------------
 * updateProduct
 * ------------------------------------------------------------------------ */

async function update(id: number, over: Record<string, unknown> = {}, as = "ana") {
  holder.userId = as
  const current = await productRow(id)
  const vs = await variantsOf(id)
  return updateProduct({
    productId: id,
    title: current.title,
    categorySlug: current.categorySlug,
    game: current.game ?? "",
    description: "Descrição atualizada com mais de vinte caracteres.",
    deliveryType: current.deliveryType,
    deliveryTime: current.deliveryTime,
    accountOrigin: current.accountOrigin ?? undefined,
    variants: vs.filter((v) => v.active).map((v) => ({ id: v.id, label: v.label, price: (v.priceCents / 100).toFixed(2).replace(".", ","), stock: String(v.stock) })),
    ...over,
  } as Parameters<typeof updateProduct>[0])
}

describe("updateProduct", () => {
  it("o dono atualiza os campos e os itens existentes", async () => {
    const { id } = await create()
    const [v] = await variantsOf(id)

    const result = await update(id, {
      title: "Robux entrega imediata novo título",
      variants: [{ id: v.id, label: "2.000 Robux", price: "79,90", stock: "3" }],
    })

    expect(result).toMatchObject({ ok: true })
    expect((await productRow(id)).title).toBe("Robux entrega imediata novo título")
    expect(await variantsOf(id)).toEqual([expect.objectContaining({ id: v.id, label: "2.000 Robux", priceCents: 7_990, stock: 3, active: true })])
  })

  it("só o dono edita: outro vendedor e usuário comum não encontram o anúncio", async () => {
    const { id } = await create()
    for (const who of ["bia", "cadu"]) {
      expect(await update(id, { title: "Título roubado do anúncio" }, who), who).toEqual({ ok: false, error: "Anúncio não encontrado." })
    }
    expect((await productRow(id)).title).toBe("Robux com entrega rápida via gamepass")
  })

  it("exige estar logado, e-mail confirmado e cadastro completo", async () => {
    const { id } = await create()
    holder.userId = null
    await expect(updateProduct({ productId: id, ...valid() })).rejects.toThrow("Não autenticado")

    // O mesmo anúncio, agora de um vendedor sem e-mail confirmado.
    await t.query(`UPDATE "product" SET "sellerId" = 'sem-email' WHERE "id" = $1`, [id])
    expect(await update(id, {}, "sem-email")).toMatchObject({ ok: false, field: "email" })
    await t.query(`UPDATE "product" SET "sellerId" = 'sem-perfil' WHERE "id" = $1`, [id])
    expect(await update(id, {}, "sem-perfil")).toMatchObject({ ok: false, field: "profile" })
  })

  it("aplica as mesmas validações da criação (e não muda nada quando recusa)", async () => {
    const { id } = await create()
    expect(await update(id, { title: "curto" })).toMatchObject({ ok: false, field: "title" })
    expect(await update(id, { description: "curta" })).toMatchObject({ ok: false, field: "description" })
    expect(await update(id, { variants: [{ label: "Item", price: "0,10", stock: "1" }] })).toMatchObject({ ok: false, field: "variants" })
    expect(await update(id, { deliveryTime: "quando eu puder" })).toMatchObject({ ok: false, field: "deliveryTime" })
    expect((await productRow(id)).title).toBe("Robux com entrega rápida via gamepass")
    expect((await variantsOf(id))[0].priceCents).toBe(4_990)
  })

  it("item novo é criado, item removido é DESATIVADO (pedidos antigos continuam apontando para ele)", async () => {
    const { id } = await create({ variants: [{ label: "Item A", price: "10,00", stock: "1" }, { label: "Item B", price: "20,00", stock: "1" }] })
    const [a, b] = await variantsOf(id)

    await update(id, { variants: [{ id: a.id, label: "Item A", price: "10,00", stock: "1" }, { label: "Item C", price: "30,00", stock: "5" }] })

    const after = await variantsOf(id)
    expect(after.find((v) => v.id === a.id)?.active).toBe(true)
    expect(after.find((v) => v.id === b.id)).toMatchObject({ label: "Item B", active: false })
    expect(after.find((v) => v.label === "Item C")).toMatchObject({ active: true, priceCents: 3_000, stock: 5 })
    expect(after).toHaveLength(3)
  })

  it("não dá para sequestrar o item de outro anúncio mandando o id dele", async () => {
    const mine = await create()
    const other = await create({ title: "Anúncio da outra vendedora" }, "bia")
    const [foreign] = await variantsOf(other.id)

    await update(mine.id, { variants: [{ id: foreign.id, label: "Sequestrado", price: "1,00", stock: "999" }] })

    expect(await variantsOf(other.id)).toEqual([expect.objectContaining({ label: "1.000 Robux", priceCents: 4_990, stock: 10, active: true })])
  })

  it("um prazo antigo em texto livre pode ficar como está, mas não dá para trocar por outro texto livre", async () => {
    const { id } = await create()
    await t.query(`UPDATE "product" SET "deliveryTime" = 'ate 24h' WHERE "id" = $1`, [id])

    expect(await update(id, { deliveryTime: "ate 24h" })).toMatchObject({ ok: true })
    expect(await update(id, { deliveryTime: "ate 99h" })).toMatchObject({ ok: false, field: "deliveryTime" })
  })

  it("trocar o jogo apaga os atributos que não valem mais e exige os do novo jogo", async () => {
    const { id } = await create({
      categorySlug: "contas",
      game: "Valorant",
      accountOrigin: "criador_sem_recuperacao",
      attributes: { regiao: "br", rank: "ouro" },
    })

    expect(await update(id, { game: "Counter Strike 2", attributes: { regiao: "br", rank: "ouro" } })).toMatchObject({ ok: false, field: "attributes" })

    await update(id, { game: "Counter Strike 2", attributes: { prime: "com-prime", patente: "supreme" } })
    expect((await productRow(id)).attributes).toEqual({ prime: "com-prime", patente: "supreme" })
  })

  it("fotos: regrava na nova ordem e só apaga do Blob as do próprio vendedor que saíram", async () => {
    const a = blob("ana", "a.webp")
    const b = blob("ana", "b.webp")
    const c = blob("ana", "c.webp")
    const { id } = await create({ images: [a, b, c] })
    // Resto de dado antigo: uma URL alheia que já estava no banco.
    const alheia = blob("bia", "alheia.webp")
    await t.query(`INSERT INTO "product_image" ("productId", "url", "sortOrder") VALUES ($1, $2, 9)`, [id, alheia])

    await update(id, { images: [c, a] })

    expect(await imagesOf(id)).toEqual([c, a])
    const deleted = holder.deleted.flat()
    expect(deleted).toContain(b)
    expect(deleted).not.toContain(alheia) // nunca apaga arquivo de outro vendedor
    expect(deleted).not.toContain(a)
    expect(deleted).not.toContain(c)
  })
})

/* ---------------------------------------------------------------------------
 * toggleProductStatus
 * ------------------------------------------------------------------------ */

describe("toggleProductStatus", () => {
  it("pausa e reativa o próprio anúncio", async () => {
    const { id } = await create()
    holder.userId = "ana"

    expect(await toggleProductStatus(id)).toMatchObject({ ok: true })
    expect((await productRow(id)).status).toBe("pausado")
    expect(await toggleProductStatus(id)).toMatchObject({ ok: true })
    expect((await productRow(id)).status).toBe("ativo")
  })

  it("só o dono mexe no anúncio", async () => {
    const { id } = await create()
    for (const who of ["bia", "cadu"]) {
      holder.userId = who
      expect(await toggleProductStatus(id), who).toEqual({ ok: false, error: "Anúncio não encontrado." })
    }
    expect((await productRow(id)).status).toBe("ativo")
  })

  it("pausar é sempre permitido, mas reativar exige e-mail confirmado e cadastro completo", async () => {
    const { id } = await create()
    await t.query(`UPDATE "product" SET "sellerId" = 'sem-email' WHERE "id" = $1`, [id])

    holder.userId = "sem-email"
    expect(await toggleProductStatus(id)).toMatchObject({ ok: true }) // pausa
    expect((await productRow(id)).status).toBe("pausado")
    expect(await toggleProductStatus(id)).toMatchObject({ ok: false, field: "email" }) // reativar
    expect((await productRow(id)).status).toBe("pausado")

    await t.query(`UPDATE "product" SET "sellerId" = 'sem-perfil' WHERE "id" = $1`, [id])
    holder.userId = "sem-perfil"
    expect(await toggleProductStatus(id)).toMatchObject({ ok: false, field: "profile" })
  })

  it("exige estar logado", async () => {
    const { id } = await create()
    holder.userId = null
    await expect(toggleProductStatus(id)).rejects.toThrow("Não autenticado")
  })
})
