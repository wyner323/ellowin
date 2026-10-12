import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { DEFAULT_LISTING_FILTERS, parseListingFilters, type ListingFilters } from "@/lib/listing-filters"
import { attributeFieldsForSlug } from "@/lib/game-attributes"
import { INSTANT_DELIVERY_TIME } from "@/lib/delivery"

/**
 * As consultas que montam o que o COMPRADOR vê (busca, categoria, página do
 * jogo, anúncios relacionados): "à venda", recorte, filtros, ordenação e
 * paginação, tudo no SQL. Um filtro errado aqui mostra anúncio errado, então
 * rodam contra um Postgres em memória com as migrações reais.
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

import { getGameListingCounts, getRelatedListings, searchListings, type ListingScope } from "@/lib/marketplace"

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
  await t.query(`TRUNCATE "review", "order", "product_image", "product_variant", "product", "seller_application", "user" RESTART IDENTITY CASCADE`)
  await addSeller("ana", { level: 4, storeName: "Loja da Ana" })
  await addSeller("bia", { level: 2, storeName: "Loja da Bia" })
  await addSeller("cadu", { level: null }) // sem candidatura: nível 1
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

async function addSeller(id: string, opts: { level: number | null; storeName?: string }) {
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ($1, $1, $1 || '@teste.dev', $2)`, [id, `Nome ${id}`])
  if (opts.level !== null) {
    await t.query(`INSERT INTO "seller_application" ("userId", "status", "level", "storeName") VALUES ($1, 'aprovado', $2, $3)`, [id, opts.level, opts.storeName ?? null])
  }
}

type VariantSpec = { price: number; stock?: number; active?: boolean }

type ProductSpec = {
  title?: string
  seller?: string
  game?: string | null
  category?: string
  deliveryType?: string
  deliveryTime?: string
  status?: string
  attributes?: Record<string, string>
  salesCount?: number
  ratingSum?: number
  ratingCount?: number
  /** Minutos atrás em que foi criado (maior = mais antigo). */
  ageMinutes?: number
  variants?: VariantSpec[]
  images?: string[]
}

let counter = 0

async function addProduct(spec: ProductSpec = {}) {
  counter++
  const { rows: p } = await t.query(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game", "deliveryType", "deliveryTime", "status", "attributes", "salesCount", "ratingSum", "ratingCount", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, now() - make_interval(mins => $13))
     RETURNING "id"`,
    [
      spec.seller ?? "ana",
      `produto-${counter}`,
      spec.title ?? `Produto ${counter}`,
      spec.category ?? "contas",
      spec.game === undefined ? "Valorant" : spec.game,
      spec.deliveryType ?? "manual",
      spec.deliveryTime ?? "Até 24 horas",
      spec.status ?? "ativo",
      JSON.stringify(spec.attributes ?? {}),
      spec.salesCount ?? 0,
      spec.ratingSum ?? 0,
      spec.ratingCount ?? 0,
      spec.ageMinutes ?? counter, // mais novo = criado depois
    ],
  )
  const id = p[0].id as number
  const variants = spec.variants ?? [{ price: 10_000, stock: 1 }]
  for (const [i, v] of variants.entries()) {
    await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock", "active", "sortOrder") VALUES ($1, $2, $3, $4, $5, $6)`, [
      id,
      `Item ${i + 1}`,
      v.price,
      v.stock ?? 1,
      v.active ?? true,
      i,
    ])
  }
  for (const [i, url] of (spec.images ?? []).entries()) {
    await t.query(`INSERT INTO "product_image" ("productId", "url", "sortOrder") VALUES ($1, $2, $3)`, [id, url, i])
  }
  return id
}

async function addReviews(productId: number, ratings: number[]) {
  for (const rating of ratings) {
    const { rows: o } = await t.query(
      `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents", "status")
       VALUES ('bia', 'ana', $1, (SELECT "id" FROM "product_variant" WHERE "productId" = $1 LIMIT 1), 'x', 'y', 1000, 80, 920, 'concluido') RETURNING "id"`,
      [productId],
    )
    await t.query(`INSERT INTO "review" ("orderId", "productId", "sellerId", "buyerId", "rating") VALUES ($1, $2, 'ana', 'bia', $3)`, [o[0].id, productId, rating])
  }
}

const f = (params: Record<string, string> = {}, ...rest: [Parameters<typeof parseListingFilters>[1]?, Parameters<typeof parseListingFilters>[2]?]): ListingFilters =>
  parseListingFilters(params, ...rest)

async function search(scope: ListingScope = {}, filters: ListingFilters = DEFAULT_LISTING_FILTERS, page = 1, pageSize = 24) {
  return searchListings(scope, filters, page, pageSize)
}

const titles = (r: Awaited<ReturnType<typeof search>>) => r.cards.filter((c) => c.source === "real").map((c) => c.title)

/* ---------------------------------------------------------------------------
 * "À venda" e o preço mostrado
 * ------------------------------------------------------------------------ */

describe("o que conta como anúncio à venda", () => {
  it("só produto ativo com ao menos um item ativo e com estoque", async () => {
    await addProduct({ title: "À venda" })
    await addProduct({ title: "Pausado", status: "pausado" })
    await addProduct({ title: "Sem estoque", variants: [{ price: 5_000, stock: 0 }] })
    await addProduct({ title: "Item desativado", variants: [{ price: 5_000, stock: 3, active: false }] })
    await addProduct({ title: "Sem itens", variants: [] })

    const r = await search({ categorySlug: "contas" }, f({ ordem: "recentes" }))
    expect(titles(r)).toEqual(["À venda"])
    expect(r.realTotal).toBe(1)
  })

  it("o 'a partir de' é o menor preço entre os itens DISPONÍVEIS (item esgotado ou desativado mais barato não conta)", async () => {
    await addProduct({
      title: "Vários itens",
      variants: [
        { price: 1_000, stock: 0 }, // esgotado: mais barato, mas indisponível
        { price: 2_000, stock: 5, active: false }, // desativado
        { price: 8_000, stock: 2 },
        { price: 6_000, stock: 1 },
      ],
    })
    const [card] = (await search()).cards
    expect(card.priceCents).toBe(6_000)
  })

  it("a loja aparece com o nome da loja; sem candidatura, cai no apelido público", async () => {
    await addProduct({ title: "Da Ana", seller: "ana" })
    await addProduct({ title: "Do Cadu", seller: "cadu" })
    const cards = (await search({}, f({ ordem: "recentes" }))).cards
    const byTitle = Object.fromEntries(cards.map((c) => [c.title, c]))
    expect(byTitle["Da Ana"].seller).toMatchObject({ name: "Loja da Ana", level: 4 })
    expect(byTitle["Do Cadu"].seller).toMatchObject({ name: "Nome cadu", level: 1 })
  })
})

/* ---------------------------------------------------------------------------
 * Recorte: categoria, texto, jogo
 * ------------------------------------------------------------------------ */

describe("recorte da lista", () => {
  it("por categoria", async () => {
    await addProduct({ title: "Conta A", category: "contas" })
    await addProduct({ title: "Moeda A", category: "moedas" })
    expect(titles(await search({ categorySlug: "moedas" }))).toEqual(["Moeda A"])
    expect(titles(await search({ categorySlug: "gift-cards" }))).toEqual([])
  })

  it("por texto: título ou jogo, sem diferenciar maiúsculas", async () => {
    await addProduct({ title: "Conta Imortal completa", game: "Valorant" })
    await addProduct({ title: "Robux em massa", game: "Roblox" })
    await addProduct({ title: "Gift card Steam", game: "Steam" })

    expect(titles(await search({ query: "imortal" }))).toEqual(["Conta Imortal completa"])
    expect(titles(await search({ query: "ROBLOX" }))).toEqual(["Robux em massa"])
    expect(titles(await search({ query: "steam" }))).toEqual(["Gift card Steam"])
    expect(titles(await search({ query: "zzz" }))).toEqual([])
  })

  it("% e _ digitados valem como texto, não como curinga", async () => {
    await addProduct({ title: "Conta qualquer", game: "Valorant" })
    await addProduct({ title: "Promoção 100% garantida", game: "Roblox" })
    await addProduct({ title: "Item_com_underline", game: "Steam" })

    expect(titles(await search({ query: "%" }))).toEqual(["Promoção 100% garantida"])
    expect(titles(await search({ query: "_" }))).toEqual(["Item_com_underline"])
    expect(titles(await search({ query: "100%" }))).toEqual(["Promoção 100% garantida"])
  })

  it("recortes se combinam (categoria + texto)", async () => {
    await addProduct({ title: "Conta Valorant", category: "contas" })
    await addProduct({ title: "Moeda Valorant", category: "moedas" })
    expect(titles(await search({ categorySlug: "moedas", query: "valorant" }))).toEqual(["Moeda Valorant"])
  })

  it("por jogo, casando pelo slug mesmo com grafias diferentes do nome livre", async () => {
    await addProduct({ title: "A", game: "Valorant" })
    await addProduct({ title: "B", game: "valorant" })
    await addProduct({ title: "C", game: "  Valorant  " })
    await addProduct({ title: "D", game: "Counter Strike 2" })
    await addProduct({ title: "E", game: null })

    const r = await search({ gameSlug: "valorant" }, f({ ordem: "recentes" }))
    expect(titles(r).sort()).toEqual(["A", "B", "C"])
    expect(titles(await search({ gameSlug: "counter-strike-2" }))).toEqual(["D"])
  })

  it("jogo sem anúncio devolve lista vazia, uma página, sem cartões de demonstração", async () => {
    const r = await search({ gameSlug: "minecraft" })
    expect(r).toEqual({ cards: [], realTotal: 0, demoTotal: 0, page: 1, pages: 1 })
  })

  it("jogo só enxerga anúncios à venda dele (pausado de outro jogo ou do mesmo não entra)", async () => {
    await addProduct({ title: "Ativo", game: "Valorant" })
    await addProduct({ title: "Pausado", game: "Valorant", status: "pausado" })
    expect(titles(await search({ gameSlug: "valorant" }))).toEqual(["Ativo"])
  })
})

/* ---------------------------------------------------------------------------
 * Filtros
 * ------------------------------------------------------------------------ */

describe("filtros", () => {
  it("faixa de preço vale para o menor preço do anúncio, com limites inclusivos", async () => {
    await addProduct({ title: "R$ 10", variants: [{ price: 1_000 }] })
    await addProduct({ title: "R$ 50", variants: [{ price: 5_000 }] })
    await addProduct({ title: "R$ 100", variants: [{ price: 10_000 }] })
    await addProduct({ title: "Misto", variants: [{ price: 2_000 }, { price: 90_000 }] })

    const only = async (params: Record<string, string>) => titles(await search({}, f({ ...params, ordem: "menor-preco" })))
    expect(await only({ min: "50" })).toEqual(["R$ 50", "R$ 100"])
    expect(await only({ max: "50" })).toEqual(["R$ 10", "Misto", "R$ 50"])
    expect(await only({ min: "10", max: "50" })).toEqual(["R$ 10", "Misto", "R$ 50"])
    expect(await only({ min: "100", max: "100" })).toEqual(["R$ 100"])
    expect(await only({ min: "500" })).toEqual([])
  })

  it("entrega imediata usa o TIPO de entrega (texto livre antigo não conta)", async () => {
    await addProduct({ title: "Auto", deliveryType: "automatica", deliveryTime: INSTANT_DELIVERY_TIME })
    await addProduct({ title: "Auto legado", deliveryType: "automatica", deliveryTime: "imediata" })
    await addProduct({ title: "Manual", deliveryType: "manual", deliveryTime: "Até 24 horas" })
    await addProduct({ title: "Manual com texto imediata", deliveryType: "manual", deliveryTime: "imediata" })

    expect(titles(await search({}, f({ entrega: "imediata", ordem: "recentes" }))).sort()).toEqual(["Auto", "Auto legado"])
  })

  it("'até 24 horas' inclui automática, janelas de até 24h e textos antigos rápidos, mas não 48/72h", async () => {
    await addProduct({ title: "Auto", deliveryType: "automatica", deliveryTime: INSTANT_DELIVERY_TIME })
    await addProduct({ title: "30 min", deliveryTime: "Até 30 minutos" })
    await addProduct({ title: "24 h", deliveryTime: "Até 24 horas" })
    await addProduct({ title: "Legado 6h", deliveryTime: "ate 6h" })
    await addProduct({ title: "48 h", deliveryTime: "Até 48 horas" })
    await addProduct({ title: "72 h", deliveryTime: "Até 72 horas" })
    await addProduct({ title: "Legado 48h", deliveryTime: "ate 48h" })

    expect(titles(await search({}, f({ entrega: "24h" }))).sort()).toEqual(["24 h", "30 min", "Auto", "Legado 6h"].sort())
  })

  it("nível mínimo do vendedor (sem candidatura conta como nível 1)", async () => {
    await addProduct({ title: "Nível 4", seller: "ana" })
    await addProduct({ title: "Nível 2", seller: "bia" })
    await addProduct({ title: "Nível 1", seller: "cadu" })

    expect(titles(await search({}, f({ nivel: "1", ordem: "recentes" }))).sort()).toEqual(["Nível 1", "Nível 2", "Nível 4"])
    expect(titles(await search({}, f({ nivel: "2" }))).sort()).toEqual(["Nível 2", "Nível 4"])
    expect(titles(await search({}, f({ nivel: "4" })))).toEqual(["Nível 4"])
    expect(titles(await search({}, f({ nivel: "5" })))).toEqual([])
  })

  it("só com avaliações", async () => {
    await addProduct({ title: "Com nota", ratingSum: 5, ratingCount: 1 })
    await addProduct({ title: "Sem nota" })
    expect(titles(await search({}, f({ avaliados: "1" })))).toEqual(["Com nota"])
  })

  it("filtros se combinam (preço + nível + prazo)", async () => {
    await addProduct({ title: "Serve", seller: "ana", variants: [{ price: 5_000 }], deliveryTime: "Até 1 hora" })
    await addProduct({ title: "Caro", seller: "ana", variants: [{ price: 50_000 }], deliveryTime: "Até 1 hora" })
    await addProduct({ title: "Nível baixo", seller: "bia", variants: [{ price: 5_000 }], deliveryTime: "Até 1 hora" })
    await addProduct({ title: "Lento", seller: "ana", variants: [{ price: 5_000 }], deliveryTime: "Até 72 horas" })

    expect(titles(await search({}, f({ max: "100", nivel: "3", entrega: "24h" })))).toEqual(["Serve"])
  })

  it("atributos do jogo filtram por chave e valor, só na página do jogo", async () => {
    const fields = attributeFieldsForSlug("valorant")
    await addProduct({ title: "Imortal BR", attributes: { regiao: "br", rank: "imortal" } })
    await addProduct({ title: "Imortal EU", attributes: { regiao: "eu", rank: "imortal" } })
    await addProduct({ title: "Ouro BR", attributes: { regiao: "br", rank: "ouro" } })
    await addProduct({ title: "Sem atributos", attributes: {} })

    const only = async (params: Record<string, string>) =>
      titles(await search({ gameSlug: "valorant" }, f({ ...params, ordem: "recentes" }, fields))).sort()
    expect(await only({ a_rank: "imortal" })).toEqual(["Imortal BR", "Imortal EU"])
    expect(await only({ a_rank: "imortal", a_regiao: "br" })).toEqual(["Imortal BR"])
    expect(await only({ a_regiao: "br" })).toEqual(["Imortal BR", "Ouro BR"])
    expect(await only({ a_rank: "radiante" })).toEqual([])
    expect(await only({})).toEqual(["Imortal BR", "Imortal EU", "Ouro BR", "Sem atributos"])
  })

  it("valor de atributo malicioso ou desconhecido na URL é ignorado, não vira SQL", async () => {
    const fields = attributeFieldsForSlug("valorant")
    await addProduct({ title: "Imortal BR", attributes: { regiao: "br", rank: "imortal" } })
    const evil = f({ a_rank: "x' OR '1'='1", a_hack: "1", a_regiao: "br" }, fields)
    expect(evil.attrs).toEqual({ regiao: "br" })
    expect(titles(await search({ gameSlug: "valorant" }, evil))).toEqual(["Imortal BR"])
  })
})

/* ---------------------------------------------------------------------------
 * Ordenação
 * ------------------------------------------------------------------------ */

describe("ordenação", () => {
  it("mais recentes (padrão) e desempate estável por id", async () => {
    await addProduct({ title: "Antigo", ageMinutes: 300 })
    await addProduct({ title: "Médio", ageMinutes: 200 })
    await addProduct({ title: "Novo", ageMinutes: 10 })
    expect(titles(await search({}, f({ ordem: "recentes" })))).toEqual(["Novo", "Médio", "Antigo"])
  })

  it("menor e maior preço (pelo menor preço disponível; empate: o mais recente)", async () => {
    await addProduct({ title: "Barato velho", variants: [{ price: 1_000 }], ageMinutes: 100 })
    await addProduct({ title: "Barato novo", variants: [{ price: 1_000 }], ageMinutes: 5 })
    await addProduct({ title: "Médio", variants: [{ price: 5_000 }, { price: 99_000 }] })
    await addProduct({ title: "Caro", variants: [{ price: 9_000 }] })

    expect(titles(await search({}, f({ ordem: "menor-preco" })))).toEqual(["Barato novo", "Barato velho", "Médio", "Caro"])
    expect(titles(await search({}, f({ ordem: "maior-preco" })))).toEqual(["Caro", "Médio", "Barato novo", "Barato velho"])
  })

  it("mais vendidos", async () => {
    await addProduct({ title: "10 vendas", salesCount: 10 })
    await addProduct({ title: "50 vendas", salesCount: 50 })
    await addProduct({ title: "0 vendas", salesCount: 0 })
    expect(titles(await search({}, f({ ordem: "vendidos" })))).toEqual(["50 vendas", "10 vendas", "0 vendas"])
  })

  it("melhor avaliados: sem avaliação por último e a média é suavizada (1 nota 5★ não passa 40 notas 4,9★)", async () => {
    await addProduct({ title: "Uma nota 5", ratingSum: 5, ratingCount: 1 })
    await addProduct({ title: "Quarenta notas 4,9", ratingSum: 196, ratingCount: 40 })
    await addProduct({ title: "Sem nota" })
    await addProduct({ title: "Duas notas 3", ratingSum: 6, ratingCount: 2 })
    await addProduct({ title: "Dez notas 4,5", ratingSum: 45, ratingCount: 10 })

    expect(titles(await search({}, f({ ordem: "avaliados" })))).toEqual([
      "Quarenta notas 4,9",
      "Dez notas 4,5",
      "Uma nota 5",
      "Duas notas 3",
      "Sem nota",
    ])
  })

  it("relevância: título que começa com o termo > palavra do título > jogo > resto; empate pelo mais recente", async () => {
    await addProduct({ title: "Conta qualquer", game: "Valorant", ageMinutes: 50 }) // só no jogo
    await addProduct({ title: "Mega conta valorant barata", game: "Roblox", ageMinutes: 40 }) // palavra do título
    await addProduct({ title: "Valorant imortal", game: "Roblox", ageMinutes: 90 }) // começa com o termo
    await addProduct({ title: "Outra conta valorant", game: "Roblox", ageMinutes: 10 }) // palavra do título (mais novo)
    await addProduct({ title: "Superbonus valorantx", game: "Steam", ageMinutes: 5 }) // palavra que COMEÇA com o termo (valorantx), mais novo
    await addProduct({ title: "Supervalorantbonus", game: "Steam", ageMinutes: 1 }) // só contém dentro de uma palavra

    const r = await search({ query: "valorant" }, f({}, [], "relevancia"))
    expect(titles(r)).toEqual([
      "Valorant imortal",
      "Superbonus valorantx",
      "Outra conta valorant",
      "Mega conta valorant barata",
      "Conta qualquer",
      "Supervalorantbonus",
    ])
  })

  it("sem termo, 'relevância' cai na ordem padrão", async () => {
    await addProduct({ title: "Velho", ageMinutes: 100 })
    await addProduct({ title: "Novo", ageMinutes: 1 })
    expect(titles(await search({}, f({}, [], "relevancia")))).toEqual(["Novo", "Velho"])
  })
})

/* ---------------------------------------------------------------------------
 * Paginação e anúncios de demonstração
 * ------------------------------------------------------------------------ */

describe("paginação", () => {
  async function seed(n: number) {
    for (let i = 0; i < n; i++) await addProduct({ title: `P${String(i).padStart(2, "0")}`, ageMinutes: i + 1 })
  }

  it("fatia em páginas sem repetir nem pular nenhum anúncio", async () => {
    await seed(25)
    const filters = f({ ordem: "recentes", nivel: "2" }) // com filtro: sem demonstração

    const seen: string[] = []
    for (let page = 1; page <= 3; page++) {
      const r = await search({}, filters, page, 10)
      expect(r.pages).toBe(3)
      expect(r.realTotal).toBe(25)
      seen.push(...titles(r))
    }
    expect(seen).toHaveLength(25)
    expect(new Set(seen).size).toBe(25)
    expect(seen[0]).toBe("P00")
    expect(seen[24]).toBe("P24")
  })

  it("a última página traz o resto e uma página além do fim cai na última", async () => {
    await seed(25)
    const filters = f({ nivel: "2" })
    expect(titles(await search({}, filters, 3, 10))).toHaveLength(5)
    const beyond = await search({}, filters, 99, 10)
    expect(beyond.page).toBe(3)
    expect(titles(beyond)).toHaveLength(5)
  })

  it("a ordenação por preço também é estável entre páginas (preços repetidos)", async () => {
    for (let i = 0; i < 12; i++) await addProduct({ title: `Igual ${i}`, variants: [{ price: 5_000 }], ageMinutes: i + 1 })
    const filters = f({ ordem: "menor-preco", nivel: "2" })
    const a = titles(await search({}, filters, 1, 5))
    const b = titles(await search({}, filters, 2, 5))
    const c = titles(await search({}, filters, 3, 5))
    expect(new Set([...a, ...b, ...c]).size).toBe(12)
  })
})

describe("desempate total", () => {
  it("anúncios com a MESMA data e o MESMO preço saem em ordem fixa (id decrescente), página após página", async () => {
    const ids: number[] = []
    for (let i = 0; i < 9; i++) ids.push(await addProduct({ title: `Empate ${i}`, variants: [{ price: 5_000 }] }))
    await t.query(`UPDATE "product" SET "createdAt" = '2026-01-01 10:00:00'`)

    const expected = [...ids].reverse().map((id) => `Empate ${ids.indexOf(id)}`)
    for (const ordem of ["recentes", "menor-preco", "maior-preco", "vendidos"]) {
      const pages = [
        ...titles(await search({}, f({ ordem, nivel: "2" }), 1, 4)),
        ...titles(await search({}, f({ ordem, nivel: "2" }), 2, 4)),
        ...titles(await search({}, f({ ordem, nivel: "2" }), 3, 4)),
      ]
      expect(pages, ordem).toEqual(expected)
    }
  })
})

describe("anúncios de demonstração", () => {
  it("entram só na vitrine limpa, depois dos reais, e a contagem real não os inclui", async () => {
    await addProduct({ title: "Real", category: "contas" })
    const clean = await search({ categorySlug: "contas" })
    expect(clean.realTotal).toBe(1)
    expect(clean.demoTotal).toBeGreaterThan(0)
    expect(clean.cards[0]).toMatchObject({ source: "real", title: "Real" })
    expect(clean.cards.slice(1).every((c) => c.source === "demo" && c.href === null)).toBe(true)

    const filtered = await search({ categorySlug: "contas" }, f({ nivel: "2" }))
    expect(filtered.demoTotal).toBe(0)
    expect(filtered.cards.every((c) => c.source === "real")).toBe(true)

    const sorted = await search({ categorySlug: "contas" }, f({ ordem: "menor-preco" }))
    expect(sorted.demoTotal).toBe(0)
  })

  it("respeitam a categoria e o texto da busca e nunca aparecem na página de um jogo", async () => {
    const moedas = await search({ categorySlug: "moedas" })
    expect(moedas.cards.every((c) => c.categorySlug === "moedas")).toBe(true)

    const noText = await search({ query: "zzzz-nada-assim" })
    expect(noText.demoTotal).toBe(0)

    await addProduct({ title: "Real Valorant", game: "Valorant" })
    const game = await search({ gameSlug: "valorant" })
    expect(game.demoTotal).toBe(0)
    expect(game.cards.every((c) => c.source === "real")).toBe(true)
  })

  it("a lista 'reais + demonstração' atravessa as páginas como uma só", async () => {
    for (let i = 0; i < 3; i++) await addProduct({ title: `Real ${i}`, category: "contas", ageMinutes: i + 1 })
    const first = await search({ categorySlug: "contas" }, DEFAULT_LISTING_FILTERS, 1, 4)
    const second = await search({ categorySlug: "contas" }, DEFAULT_LISTING_FILTERS, 2, 4)

    expect(first.cards.map((c) => c.source)).toEqual(["real", "real", "real", "demo"])
    expect(second.cards.every((c) => c.source === "demo")).toBe(true)
    const keys = [...first.cards, ...second.cards].map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(first.realTotal + first.demoTotal).toBe(first.pages === 1 ? first.cards.length : 3 + first.demoTotal)
  })
})

/* ---------------------------------------------------------------------------
 * O conteúdo de cada cartão
 * ------------------------------------------------------------------------ */

describe("cartão do anúncio", () => {
  it("capa: a foto de menor ordem; sem foto, a imagem da categoria", async () => {
    await addProduct({ title: "Com fotos", images: ["https://exemplo.com/capa.webp", "https://exemplo.com/segunda.webp"] })
    await addProduct({ title: "Sem foto" })
    const cards = Object.fromEntries((await search({}, f({ nivel: "2" }))).cards.map((c) => [c.title, c]))
    expect(cards["Com fotos"].imageUrl).toBe("https://exemplo.com/capa.webp")
    expect(cards["Sem foto"].imageUrl).toMatch(/\.(png|jpg|jpeg|webp|svg)|^\/|^https?:/)
    expect(cards["Sem foto"].imageUrl).not.toBe("")
  })

  it("nota média arredondada em 1 casa, ou nula sem avaliações; link para a página do anúncio", async () => {
    const id = await addProduct({ title: "Avaliado", ratingSum: 14, ratingCount: 3 })
    await addProduct({ title: "Novo" })
    const cards = Object.fromEntries((await search({}, f({ nivel: "2" }))).cards.map((c) => [c.title, c]))
    expect(cards["Avaliado"].seller.rating).toBe(4.7)
    expect(cards["Avaliado"].ratingCount).toBe(3)
    expect(cards["Avaliado"].href).toBe(`/produtos/produto-${id}`.replace(`produto-${id}`, `produto-${counter - 1}`))
    expect(cards["Novo"].seller.rating).toBeNull()
  })

  it("'entrega imediata', estoque somado (só itens ativos) e % positivas só a partir de 5 avaliações", async () => {
    const auto = await addProduct({ title: "Auto", deliveryType: "automatica", deliveryTime: INSTANT_DELIVERY_TIME, variants: [{ price: 1_000, stock: 2 }, { price: 2_000, stock: 3 }, { price: 3_000, stock: 50, active: false }], ratingSum: 22, ratingCount: 5 })
    await addReviews(auto, [5, 5, 4, 4, 3]) // 4 de 5 são 4★ ou mais = 80%
    const few = await addProduct({ title: "Poucas", ratingSum: 8, ratingCount: 2 })
    await addReviews(few, [4, 4])

    const cards = Object.fromEntries((await search({}, f({ nivel: "2" }))).cards.map((c) => [c.title, c]))
    expect(cards["Auto"]).toMatchObject({ instant: true, stock: 5, positivePct: 80, ratingCount: 5 })
    expect(cards["Poucas"]).toMatchObject({ instant: false, positivePct: null })
  })

  it("destaques vêm dos atributos marcados do jogo (no máximo 2) e somem fora do jogo", async () => {
    await addProduct({ title: "Imortal", category: "contas", game: "Valorant", attributes: { regiao: "br", rank: "imortal", skins: "30-59" } })
    await addProduct({ title: "Roblox", category: "contas", game: "Roblox", attributes: { rank: "imortal" } })
    const cards = Object.fromEntries((await search({}, f({ nivel: "2" }))).cards.map((c) => [c.title, c]))
    expect(cards["Imortal"].highlights).toEqual(["Brasil", "Imortal"])
    expect(cards["Roblox"].highlights).toEqual([])
  })
})

/* ---------------------------------------------------------------------------
 * Anúncios relacionados
 * ------------------------------------------------------------------------ */

describe("getRelatedListings", () => {
  it("do mesmo jogo, sem o próprio anúncio, só à venda e até o limite", async () => {
    const base = await addProduct({ title: "Base", game: "Valorant", seller: "ana" })
    for (let i = 0; i < 6; i++) await addProduct({ title: `Valorant ${i}`, game: "Valorant", seller: "bia", ageMinutes: i + 1 })
    await addProduct({ title: "Outro jogo", game: "Roblox", seller: "bia" })
    await addProduct({ title: "Pausado", game: "Valorant", seller: "bia", status: "pausado" })
    await addProduct({ title: "Sem estoque", game: "Valorant", seller: "bia", variants: [{ price: 1_000, stock: 0 }] })

    const { sameGame } = await getRelatedListings({ id: base, game: "Valorant", categorySlug: "contas", sellerId: "ana" }, 4)
    expect(sameGame).toHaveLength(4)
    expect(sameGame.every((c) => c.title.startsWith("Valorant "))).toBe(true)
    expect(sameGame.map((c) => c.title)).not.toContain("Base")
  })

  it("sem jogo, usa a categoria", async () => {
    const base = await addProduct({ title: "Base", game: null, category: "boosting" })
    await addProduct({ title: "Mesma categoria", game: null, category: "boosting", seller: "bia" })
    await addProduct({ title: "Outra categoria", game: null, category: "contas", seller: "bia" })
    const { sameGame } = await getRelatedListings({ id: base, game: null, categorySlug: "boosting", sellerId: "ana" })
    expect(sameGame.map((c) => c.title)).toEqual(["Mesma categoria"])
  })

  it("da mesma loja, sem repetir o que já saiu em 'mesmo jogo'", async () => {
    const base = await addProduct({ title: "Base", game: "Valorant", seller: "ana" })
    await addProduct({ title: "Mesma loja e jogo", game: "Valorant", seller: "ana", ageMinutes: 1 })
    await addProduct({ title: "Mesma loja, outro jogo", game: "Roblox", seller: "ana", ageMinutes: 2 })
    await addProduct({ title: "Outra loja, mesmo jogo", game: "Valorant", seller: "bia", ageMinutes: 3 })

    const { sameGame, sameSeller } = await getRelatedListings({ id: base, game: "Valorant", categorySlug: "contas", sellerId: "ana" })
    expect(sameGame.map((c) => c.title).sort()).toEqual(["Mesma loja e jogo", "Outra loja, mesmo jogo"].sort())
    expect(sameSeller.map((c) => c.title)).toEqual(["Mesma loja, outro jogo"])
  })

  it("sem outros anúncios devolve listas vazias", async () => {
    const base = await addProduct({ title: "Sozinho" })
    expect(await getRelatedListings({ id: base, game: "Valorant", categorySlug: "contas", sellerId: "ana" })).toEqual({ sameGame: [], sameSeller: [] })
  })
})

/* ---------------------------------------------------------------------------
 * Contagem por jogo (índice /jogos e atalhos da busca)
 * ------------------------------------------------------------------------ */

describe("getGameListingCounts", () => {
  it("conta os anúncios À VENDA por jogo, com a mesma regra da página do jogo", async () => {
    await addProduct({ game: "Valorant" })
    await addProduct({ game: "valorant" })
    await addProduct({ game: "Valorant", status: "pausado" })
    await addProduct({ game: "Valorant", variants: [{ price: 1_000, stock: 0 }] })
    await addProduct({ game: "Roblox" })
    await addProduct({ game: null })

    const counts = await getGameListingCounts()
    expect(counts).toEqual({ valorant: 2, roblox: 1 })

    // Bate com o que a página do jogo realmente lista.
    expect((await search({ gameSlug: "valorant" })).realTotal).toBe(counts.valorant)
  })
})
