import { describe, expect, it } from "vitest"
import { breadcrumbJsonLd, productSeo, websiteJsonLd } from "@/lib/seo"

const item = (over: Partial<Parameters<typeof productSeo>[0]> = {}) => ({
  title: "Conta Valorant Imortal 2 com coleção completa de skins",
  game: "Valorant",
  description: "Conta com 120 skins, nível 200 e e-mail original incluso, entrega pelo chat do pedido.",
  variants: [{ priceCents: 7_900, stock: 1 }],
  ...over,
})

describe("productSeo", () => {
  it("põe o preço no título e fecha com a marca", () => {
    const { title } = productSeo(item())
    expect(title).toContain("por R$")
    expect(title).toContain("79,00")
    expect(title.endsWith("| Ellowin")).toBe(true)
  })

  it("com mais de um preço diferente diz 'a partir de' o menor com estoque", () => {
    const { title } = productSeo(item({ variants: [{ priceCents: 15_000, stock: 2 }, { priceCents: 7_900, stock: 1 }, { priceCents: 1_000, stock: 0 }] }))
    expect(title).toContain("a partir de")
    expect(title).toContain("79,00")
    expect(title).not.toContain("10,00")
  })

  it("título comprido é cortado sem partir palavra no meio e o resultado cabe numa linha do Google", () => {
    const { title } = productSeo(item({ title: "Conta ".repeat(40) }))
    expect(title.length).toBeLessThanOrEqual(75)
    expect(title).toContain("…")
  })

  it("descrição junta um trecho do anúncio com a frase de pagamento protegido e cabe em 160 caracteres", () => {
    const { description } = productSeo(item({ description: "x ".repeat(500) }))
    expect(description.length).toBeLessThanOrEqual(190)
    expect(description).toContain("o vendedor só recebe depois que você confirma")
    expect(description).not.toMatch(/\s{2,}/)
  })

  it("sem variante não quebra e não inventa preço", () => {
    const { title } = productSeo(item({ variants: [] }))
    expect(title).not.toContain("R$")
  })

  it("não promete o que o sistema não faz (garantia, minutos, 24/7)", () => {
    const { title, description } = productSeo(item())
    for (const text of [title, description]) expect(text).not.toMatch(/garantia|em minutos|24\/7|verificad/i)
  })
})

describe("breadcrumbJsonLd e websiteJsonLd", () => {
  it("a trilha vira itens numerados com URL absoluta", () => {
    const ld = breadcrumbJsonLd([{ name: "Início", path: "/" }, { name: "Jogos", path: "/jogos" }])
    expect(ld["@type"]).toBe("BreadcrumbList")
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Início", item: "https://ellowin.com.br/" },
      { "@type": "ListItem", position: 2, name: "Jogos", item: "https://ellowin.com.br/jogos" },
    ])
  })

  it("o site declara a busca (SearchAction) apontando para /busca?q=", () => {
    const graph = websiteJsonLd()["@graph"]
    const site = graph.find((n) => n["@type"] === "WebSite") as { potentialAction: { target: { urlTemplate: string } } }
    expect(site.potentialAction.target.urlTemplate).toBe("https://ellowin.com.br/busca?q={search_term_string}")
    expect(graph.some((n) => n["@type"] === "Organization")).toBe(true)
  })
})
