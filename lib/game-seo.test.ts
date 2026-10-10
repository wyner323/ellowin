import { describe, expect, it } from "vitest"
import { GAME_ATTRIBUTES } from "@/lib/game-attributes"
import { GAME_SEO, getGameSeo } from "@/lib/game-seo"
import { findGameBySlug } from "@/lib/product-catalog"

const entries = Object.entries(GAME_SEO)

function textOf(slug: string) {
  const seo = GAME_SEO[slug]
  return [seo.metaDescription, seo.intro, ...seo.tips, ...seo.faq.flatMap((f) => [f.question, f.answer])].join("\n")
}

describe("GAME_SEO", () => {
  it("cada jogo existe no catálogo", () => {
    for (const [slug] of entries) expect(findGameBySlug(slug), slug).not.toBeNull()
  })

  it("todo jogo com atributos estruturados também tem texto", () => {
    for (const slug of Object.keys(GAME_ATTRIBUTES)) expect(getGameSeo(slug), slug).not.toBeNull()
  })

  it("jogo sem texto devolve null", () => {
    expect(getGameSeo("jogo-que-nao-existe")).toBeNull()
  })

  it("a meta description cabe no resultado de busca", () => {
    for (const [slug, seo] of entries) {
      expect(seo.metaDescription.length, slug).toBeGreaterThan(60)
      expect(seo.metaDescription.length, slug).toBeLessThanOrEqual(170)
    }
  })

  it("tem introdução, dicas e perguntas, com ids de pergunta únicos por jogo", () => {
    for (const [slug, seo] of entries) {
      expect(seo.intro.length, slug).toBeGreaterThan(60)
      expect(seo.tips.length, slug).toBeGreaterThanOrEqual(3)
      expect(seo.faq.length, slug).toBeGreaterThanOrEqual(2)
      const ids = seo.faq.map((f) => f.id)
      expect(new Set(ids).size, slug).toBe(ids.length)
      for (const f of seo.faq) {
        expect(f.question.trim().endsWith("?"), `${slug}: ${f.question}`).toBe(true)
        expect(f.answer.length, `${slug}: ${f.id}`).toBeGreaterThan(40)
      }
    }
  })

  it("o texto de um jogo não é copiado em outro", () => {
    const seen = new Map<string, string>()
    for (const [slug, seo] of entries) {
      for (const piece of [seo.intro, seo.metaDescription, ...seo.tips]) {
        const other = seen.get(piece)
        expect(other, `${slug} repete texto de ${other}`).toBeUndefined()
        seen.set(piece, slug)
      }
    }
  })

  it("não promete o que o sistema não cumpre", () => {
    for (const [slug] of entries) {
      const text = textOf(slug)
      for (const banned of [
        "verificado",
        "em minutos",
        "24/7",
        "24 horas por dia",
        "garantia de",
        "menor taxa",
        "reembolso imediato",
        "100% seguro",
        "sem risco",
      ])
        expect(text.toLowerCase(), `${slug}: "${banned}"`).not.toContain(banned.toLowerCase())
    }
  })

  it("não digita prazos em dias (eles vêm das constantes no componente)", () => {
    for (const [slug] of entries) expect(textOf(slug), slug).not.toMatch(/\b\d+\s*dias\b/i)
  })
})
