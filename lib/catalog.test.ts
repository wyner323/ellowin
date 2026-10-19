import { describe, expect, it } from "vitest"
import { categories, getCategory } from "@/lib/catalog"

describe("categorias do catálogo", () => {
  it("os slugs são únicos e getCategory acha cada um (createProduct valida a categoria por aqui)", () => {
    const slugs = categories.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) expect(getCategory(slug)?.slug).toBe(slug)
    expect(getCategory("inventada")).toBeUndefined()
  })

  it("os textos públicos não prometem o que o sistema não faz (vendedor 'verificado', entrega 'em minutos')", () => {
    for (const c of categories) {
      const text = `${c.tagline} ${c.description}`.toLowerCase()
      expect(text, c.slug).not.toContain("verificado")
      expect(text, c.slug).not.toContain("em minutos")
    }
  })
})
