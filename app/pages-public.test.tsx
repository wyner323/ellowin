import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { htmlToText, renderHtml } from "@/lib/test-render"
import { formatCents } from "@/lib/money"

/**
 * As telas públicas (home, anúncio, loja, busca, categoria, jogo) renderizadas de
 * verdade contra um Postgres em memória. O que se confere: monta sem erro, mostra
 * o que o banco tem (e só o que deve aparecer), nunca o nome legal, e não deixa
 * texto de vendedor escapar para dentro do HTML.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
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
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-nonce": "nonce-de-teste" }),
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("next/server", () => ({ after: () => {} }))
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }))
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }))

import HomePage from "@/app/page"
import ProductPage, { generateMetadata as productMetadata } from "@/app/produtos/[slug]/page"
import LojaPage from "@/app/loja/[slug]/page"
import BuscaPage, { metadata as buscaMetadata } from "@/app/busca/page"
import CatalogPage from "@/app/catalogo/[slug]/page"
import JogoPage, { generateMetadata as jogoMetadata } from "@/app/jogos/[slug]/page"
import sitemap from "@/app/sitemap"
import JogosPage from "@/app/jogos/page"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

let n = 0

beforeEach(async () => {
  holder.userId = null
  await t.query(
    `TRUNCATE "product_question", "review", "dispute", "order", "product_image", "product_variant", "product", "report", "wallet", "seller_application", "profile", "user" RESTART IDENTITY CASCADE`,
  )
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('ana', 'Ana Maria da Silva', 'ana@teste.dev', 'AnaGames')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('comprador', 'Carlos Pereira Lima', 'carlos@teste.dev', 'CarlosPlay')`)
  await t.query(`INSERT INTO "seller_application" ("userId", "storeName", "storeSlug", "level", "status") VALUES ('ana', 'Loja da Ana', 'loja-da-ana', 4, 'aprovado')`)
})

async function addListing(
  opts: {
    slug?: string
    title?: string
    category?: string
    game?: string | null
    status?: string
    description?: string
    price?: number
    stock?: number
    attributes?: Record<string, string>
    seller?: string
  } = {},
) {
  n++
  const p = await t.query(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game", "status", "description", "attributes", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, '2026-01-01 10:00:00'::timestamp + make_interval(mins => ${n})) RETURNING "id"`,
    [
      opts.seller ?? "ana",
      opts.slug ?? `anuncio-${n}`,
      opts.title ?? `Anúncio ${n}`,
      opts.category ?? "contas",
      opts.game === undefined ? "Valorant" : opts.game,
      opts.status ?? "ativo",
      opts.description ?? "Descrição do anúncio",
      JSON.stringify(opts.attributes ?? {}),
    ],
  )
  const id = p.rows[0].id as number
  await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Conta A', $2, $3)`, [id, opts.price ?? 25_000, opts.stock ?? 2])
  return id
}

const page = async (node: Promise<React.ReactNode> | React.ReactNode) => renderHtml(await node)
const text = async (node: Promise<React.ReactNode> | React.ReactNode) => htmlToText(await page(node))
const params = <T,>(p: T) => ({ params: Promise.resolve(p) })

/* ---------------------------------------------------------------------------
 * Home
 * ------------------------------------------------------------------------ */

describe("home", () => {
  it("sem nenhum anúncio ainda monta, sem inventar números nem valores quebrados", async () => {
    const html = await page(HomePage())
    expect(html).toContain('id="conteudo"')
    expect(html).not.toContain("NaN")
    expect(html).not.toContain("undefined")
    expect(html).not.toContain("null")
    expect(htmlToText(html)).toContain("Anúncios em destaque")
  })

  it("declara a organização e a caixa de busca do site em dados estruturados", async () => {
    const html = await page(HomePage())
    expect(html).toContain("application/ld+json")
    expect(html).toContain("SearchAction")
    expect(html).toContain("busca?q={search_term_string}")
  })

  it("com anúncios reais mostra título, preço 'a partir de' e o jogo na faixa", async () => {
    await addListing({ title: "Conta Valorant Imortal", price: 25_000 })
    await addListing({ title: "Gift Card Steam", category: "gift-cards", game: "Steam", price: 9_000 })
    const txt = await text(HomePage())
    expect(txt).toContain("Conta Valorant Imortal")
    expect(txt).toContain("R$ 250,00")
    expect(txt).toContain("a partir de R$ 90,00")
    expect(txt).toContain("Jogos com anúncios")
    expect(txt).toContain("Valorant")
    expect(txt).toContain("Steam")
  })

  it("anúncio pausado ou esgotado não aparece na home", async () => {
    await addListing({ title: "Pausado Secreto", status: "pausado" })
    await addListing({ title: "Esgotado Secreto", stock: 0 })
    const txt = await text(HomePage())
    expect(txt).not.toContain("Pausado Secreto")
    expect(txt).not.toContain("Esgotado Secreto")
  })

  it("nunca mostra nome legal do vendedor", async () => {
    await addListing({ title: "Conta qualquer" })
    expect(await text(HomePage())).not.toContain("Ana Maria da Silva")
  })
})

/* ---------------------------------------------------------------------------
 * Página do anúncio
 * ------------------------------------------------------------------------ */

describe("página do anúncio", () => {
  it("mostra título, itens com preço, vendedor (loja), atributos do jogo e descrição", async () => {
    await addListing({ slug: "conta-valorant", title: "Conta Valorant Imortal", description: "Conta completa com skins", attributes: { regiao: "br", rank: "imortal" } })
    const html = await page(ProductPage(params({ slug: "conta-valorant" })))
    const txt = htmlToText(html)
    expect(html).toContain('id="conteudo"')
    expect(txt).toContain("Conta Valorant Imortal")
    expect(txt).toContain("Conta A")
    expect(txt).toContain("R$ 250,00")
    expect(txt).toContain("Loja da Ana")
    expect(txt).toContain("Imortal")
    expect(txt).toContain("Brasil")
    expect(txt).toContain("Conta completa com skins")
    expect(txt).not.toContain("Ana Maria da Silva")
    expect(html).toContain('href="/loja/loja-da-ana"')
  })

  it("slug inexistente cai no 404", async () => {
    await expect(ProductPage(params({ slug: "nao-existe" }))).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("dados estruturados: JSON válido (dado, não script: sem nonce) e texto do vendedor não fecha o <script>", async () => {
    await addListing({ slug: "malicioso", title: "</script><script>alert(1)</script>", description: "</script><img src=x onerror=alert(1)>" })
    const html = await page(ProductPage(params({ slug: "malicioso" })))
    const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)
    expect(m).not.toBeNull()
    const data = JSON.parse(m![1])
    expect(data["@type"]).toBe("Product")
    expect(data.name).toBe("</script><script>alert(1)</script>")
    expect(m![1]).not.toContain("</script")
    expect(html).not.toContain("<script>alert(1)")
    expect(html).not.toContain("<img src=x")
  })

  it("anúncio pausado avisa e não oferece compra; fora do índice dos buscadores", async () => {
    await addListing({ slug: "pausado", status: "pausado" })
    const txt = await text(ProductPage(params({ slug: "pausado" })))
    expect(txt).toContain("Anúncio pausado")
    expect(txt).toContain("pausado pelo vendedor e não aceita compras")
    const meta = await productMetadata(params({ slug: "pausado" }))
    expect(meta.robots).toEqual({ index: false, follow: true })
  })

  it("anúncio ativo leva dados estruturados de produto (uma oferta por variante) e a trilha de navegação", async () => {
    await addListing({ slug: "estruturado", title: "Conta Estruturada", game: "Valorant", price: 12_000 })
    const html = await page(ProductPage(params({ slug: "estruturado" })))
    expect(html).toContain('"@type":"Product"')
    expect(html).toContain('"@type":"AggregateOffer"')
    expect(html).toContain('"@type":"Offer"')
    expect(html).toContain('"@type":"BreadcrumbList"')
    expect(html).toContain("https://ellowin.com.br/jogos/valorant")
  })

  it("anúncio ativo é indexável (sem robots) e tem canônico", async () => {
    await addListing({ slug: "ativo", title: "Conta Ativa" })
    const meta = await productMetadata(params({ slug: "ativo" }))
    expect(meta.robots).toBeUndefined()
    expect(meta.alternates).toEqual({ canonical: "/produtos/ativo" })
    expect(meta.title).toBe(`Conta Ativa por ${formatCents(25_000)} | Ellowin`)
  })

  it("avaliações e perguntas aparecem com nomes públicos", async () => {
    const id = await addListing({ slug: "com-reputacao" })
    const v = await t.query(`SELECT "id" FROM "product_variant" WHERE "productId" = $1`, [id])
    const o = await t.query(
      `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "status") VALUES ('comprador', 'ana', $1, $2, 'x', 'y', 1000, 'concluido') RETURNING "id"`,
      [id, v.rows[0].id],
    )
    await t.query(`INSERT INTO "review" ("orderId", "productId", "sellerId", "buyerId", "rating", "comment") VALUES ($1, $2, 'ana', 'comprador', 5, 'Entrega rápida e tudo certo')`, [o.rows[0].id, id])
    await t.query(`UPDATE "product" SET "ratingSum" = 5, "ratingCount" = 1 WHERE "id" = $1`, [id])
    await t.query(`INSERT INTO "product_question" ("productId", "askerId", "question", "answer", "answeredAt") VALUES ($1, 'comprador', 'Tem garantia de rank?', 'Tem sim', now())`, [id])
    const txt = await text(ProductPage(params({ slug: "com-reputacao" })))
    expect(txt).toContain("Entrega rápida e tudo certo")
    expect(txt).toContain("CarlosPlay")
    expect(txt).toContain("Tem garantia de rank?")
    expect(txt).toContain("Tem sim")
    expect(txt).not.toContain("Carlos Pereira Lima")
  })

  it("anúncios relacionados: da mesma loja/jogo, sem repetir o próprio", async () => {
    await addListing({ slug: "principal", title: "Anúncio Principal" })
    await addListing({ slug: "irmao", title: "Anúncio Irmão" })
    const txt = await text(ProductPage(params({ slug: "principal" })))
    expect(txt).toContain("Mais de Valorant")
    expect(txt).toContain("Anúncio Irmão")
    expect(txt.match(/Anúncio Principal/g)!.length).toBeLessThan(6)
  })

  it("denunciar só aparece para quem está logado e não é o dono", async () => {
    await addListing({ slug: "denuncia" })
    expect(await text(ProductPage(params({ slug: "denuncia" })))).not.toContain("Denunciar anúncio")
    holder.userId = "comprador"
    expect(await text(ProductPage(params({ slug: "denuncia" })))).toContain("Denunciar anúncio")
    holder.userId = "ana"
    expect(await text(ProductPage(params({ slug: "denuncia" })))).not.toContain("Denunciar anúncio")
  })
})

/* ---------------------------------------------------------------------------
 * Loja pública
 * ------------------------------------------------------------------------ */

describe("loja pública", () => {
  it("mostra o nome da loja, o nível e só os anúncios à venda", async () => {
    await addListing({ title: "Anúncio à Venda" })
    await addListing({ title: "Anúncio Pausado", status: "pausado" })
    await addListing({ title: "Anúncio Esgotado", stock: 0 })
    const txt = await text(LojaPage(params({ slug: "loja-da-ana" })))
    expect(txt).toContain("Loja da Ana")
    expect(txt).toContain("Nível 4")
    expect(txt).toContain("Anúncio à Venda")
    expect(txt).not.toContain("Anúncio Pausado")
    expect(txt).not.toContain("Anúncio Esgotado")
    expect(txt).not.toContain("Ana Maria da Silva")
  })

  it("loja sem anúncios mostra o aviso", async () => {
    expect(await text(LojaPage(params({ slug: "loja-da-ana" })))).toContain("Esta loja não tem anúncios ativos no momento.")
  })

  it("endereço sem diferenciar maiúsculas; inexistente ou vendedor não aprovado: 404", async () => {
    expect(await text(LojaPage(params({ slug: "LOJA-DA-ANA" })))).toContain("Loja da Ana")
    await expect(LojaPage(params({ slug: "nao-existe" }))).rejects.toThrow("NEXT_NOT_FOUND")
    await t.query(`UPDATE "seller_application" SET "status" = 'em_andamento'`)
    await expect(LojaPage(params({ slug: "loja-da-ana" }))).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("bio com HTML é mostrada como texto, nunca como marcação", async () => {
    await t.query(`UPDATE "user" SET "bio" = '<script>alert(1)</script><b>negrito</b>' WHERE "id" = 'ana'`)
    const html = await page(LojaPage(params({ slug: "loja-da-ana" })))
    expect(html).not.toContain("<script>alert(1)")
    expect(html).not.toContain("<b>negrito</b>")
    expect(htmlToText(html)).toContain("<b>negrito</b>")
  })

  it("denunciar vendedor só para logado que não é o dono", async () => {
    expect(await text(LojaPage(params({ slug: "loja-da-ana" })))).not.toContain("Denunciar vendedor")
    holder.userId = "comprador"
    expect(await text(LojaPage(params({ slug: "loja-da-ana" })))).toContain("Denunciar vendedor")
    holder.userId = "ana"
    expect(await text(LojaPage(params({ slug: "loja-da-ana" })))).not.toContain("Denunciar vendedor")
  })
})

/* ---------------------------------------------------------------------------
 * Busca, categoria e jogo
 * ------------------------------------------------------------------------ */

describe("busca", () => {
  const busca = (q: Record<string, string>) => page(BuscaPage({ searchParams: Promise.resolve(q) }))

  it("fora do índice dos buscadores", () => {
    expect(buscaMetadata.robots).toEqual({ index: false, follow: true })
  })

  it("com termo: título da busca, resultado e contagem", async () => {
    await addListing({ title: "Conta Valorant Imortal" })
    await addListing({ title: "Robux 10 mil", category: "moedas", game: "Roblox" })
    const txt = htmlToText(await busca({ q: "valorant" }))
    expect(txt).toContain('Resultados para "valorant"')
    expect(txt).toContain("Conta Valorant Imortal")
    expect(txt).not.toContain("Robux 10 mil")
    expect(txt).toContain("1 anúncio encontrado")
  })

  it("sem resultado: mostra o vazio e o caminho de volta", async () => {
    const txt = htmlToText(await busca({ q: "xyzxyz" }))
    expect(txt).toContain("Nenhum anúncio corresponde à sua busca.")
    expect(txt).toContain("Ver todos os anúncios")
  })

  it("o termo digitado é escapado no título (não vira HTML)", async () => {
    const html = await busca({ q: "<img src=x onerror=alert(1)>" })
    expect(html).not.toContain("<img src=x")
    expect(htmlToText(html)).toContain("<img src=x onerror=alert(1)>")
  })

  it("sem termo: 'Todos os anúncios' e atalhos para jogos com anúncio; categoria inválida é ignorada", async () => {
    await addListing({ title: "Conta Que Deve Aparecer", game: "Valorant" })
    const txt = htmlToText(await busca({ categoria: "nao-existe" }))
    expect(txt).toContain("Todos os anúncios")
    expect(txt).toContain("Conta Que Deve Aparecer") // categoria inválida não zera a busca
    expect(txt).toContain("Jogos com anúncios")
    expect(txt).toContain("Valorant")
  })

  it("filtro de categoria recorta o resultado", async () => {
    await addListing({ title: "Conta A1", category: "contas" })
    await addListing({ title: "Moeda M1", category: "moedas" })
    const txt = htmlToText(await busca({ categoria: "moedas" }))
    expect(txt).toContain("Moeda M1")
    expect(txt).not.toContain("Conta A1")
  })

  it("termo gigante é cortado em 80 caracteres", async () => {
    const txt = htmlToText(await busca({ q: "a".repeat(200) }))
    expect(txt).toContain(`Resultados para "${"a".repeat(80)}"`)
    expect(txt).not.toContain("a".repeat(81))
  })
})

describe("categoria", () => {
  const cat = (slug: string, q: Record<string, string> = {}) =>
    page(CatalogPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(q) }))

  it("categoria inexistente: 404", async () => {
    await expect(cat("nao-existe")).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("mostra o nome, contagem real, 'a partir de' e os anúncios da categoria", async () => {
    await addListing({ title: "Conta Barata", price: 8_000 })
    await addListing({ title: "Conta Cara", price: 90_000 })
    await addListing({ title: "Moeda Fora", category: "moedas", price: 100 })
    const txt = htmlToText(await cat("contas"))
    expect(txt).toContain("Conta Barata")
    expect(txt).toContain("Conta Cara")
    expect(txt).not.toContain("Moeda Fora")
    expect(txt).toContain("a partir de R$ 80,00")
    expect(txt).toContain("2 anúncios encontrados")
  })

  it("filtro de preço e ordenação chegam da URL", async () => {
    await addListing({ title: "Conta Barata", price: 8_000 })
    await addListing({ title: "Conta Cara", price: 90_000 })
    const txt = htmlToText(await cat("contas", { min: "100", ordem: "menor-preco" }))
    expect(txt).toContain("Conta Cara")
    expect(txt).not.toContain("Conta Barata")
  })
})

describe("jogos", () => {
  const jogo = (slug: string, q: Record<string, string> = {}) =>
    page(JogoPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(q) }))

  it("SEO: jogo sem anúncio e sem texto próprio sai do índice e do sitemap; com anúncio ou texto próprio entra", async () => {
    const meta = (slug: string) => jogoMetadata({ params: Promise.resolve({ slug }) })
    // aion: está no catálogo, não tem texto próprio e ninguém vende
    expect((await meta("aion")).robots).toEqual({ index: false, follow: true })
    // valorant tem texto próprio (lib/game-seo.ts), mesmo sem anúncio
    expect((await meta("valorant")).robots).toBeUndefined()
    // um jogo sem texto próprio passa a ser indexável quando alguém anuncia
    await addListing({ title: "Conta Aion", game: "Aion" })
    expect((await meta("aion")).robots).toBeUndefined()

    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toContain("https://ellowin.com.br/jogos/valorant")
    expect(urls).toContain("https://ellowin.com.br/jogos/aion")
    expect(urls).not.toContain("https://ellowin.com.br/jogos/aika")
  })

  it("SEO: o título da página do jogo diz o que há ali", async () => {
    const meta = await jogoMetadata({ params: Promise.resolve({ slug: "valorant" }) })
    expect(meta.title).toBe("Valorant: contas, moedas e serviços | Ellowin")
  })

  it("jogo fora do catálogo: 404", async () => {
    await expect(jogo("jogo-que-nao-existe")).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("página do jogo: anúncios, contagem real, texto de SEO e filtros do jogo", async () => {
    await addListing({ title: "Conta Imortal BR", attributes: { regiao: "br", rank: "imortal" } })
    await addListing({ title: "Conta Ouro EU", attributes: { regiao: "eu", rank: "ouro" } })
    const txt = htmlToText(await jogo("valorant"))
    expect(txt).toContain("Conta Imortal BR")
    expect(txt).toContain("Conta Ouro EU")
    expect(txt).toContain("2 anúncios encontrados")
    expect(txt).toContain("Valorant")
  })

  it("filtro por atributo do jogo vem da URL e recorta", async () => {
    await addListing({ title: "Conta Imortal BR", attributes: { regiao: "br", rank: "imortal" } })
    await addListing({ title: "Conta Ouro EU", attributes: { regiao: "eu", rank: "ouro" } })
    const txt = htmlToText(await jogo("valorant", { a_rank: "imortal" }))
    expect(txt).toContain("Conta Imortal BR")
    expect(txt).not.toContain("Conta Ouro EU")
  })

  it("índice de jogos conta só o que está à venda", async () => {
    await addListing({ game: "Valorant" })
    await addListing({ game: "Valorant", stock: 0 })
    await addListing({ game: "Valorant", status: "pausado" })
    const txt = htmlToText(await page(JogosPage()))
    expect(txt).toContain("Jogos")
    expect(txt).toContain("Valorant 1 ")
    expect(txt).not.toContain("Valorant 2 ")
    expect(txt).not.toContain("Valorant 3 ")
  })
})
