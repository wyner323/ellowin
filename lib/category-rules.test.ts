import { describe, expect, it } from "vitest"
import { categories, getCategory, HEADER_CATEGORY_SLUGS } from "@/lib/catalog"
import {
  CATEGORY_RULE_SLUGS,
  RESTRICTED_CATEGORY_SLUGS,
  categoryRule,
  describeBuyerInfo,
  isRestrictedCategory,
  sanitizeBuyerInfo,
} from "@/lib/category-rules"
import { allowsAutoDelivery } from "@/lib/delivery-stock-lines"
import { GAMES, OUTRAS_CATEGORIAS, PRODUCT_KINDS, productKindsForGame } from "@/lib/product-catalog"

const BANNED = ["garantia", "garantido", "verificado", "validado", "conferido", "em minutos", "24/7", "100% seguro"]

describe("regras por categoria", () => {
  it("toda categoria do catálogo tem regra, e toda regra é de uma categoria do catálogo", () => {
    expect(categories.map((c) => c.slug).sort()).toEqual([...CATEGORY_RULE_SLUGS].sort())
    for (const slug of CATEGORY_RULE_SLUGS) expect(getCategory(slug), slug).toBeDefined()
  })

  it("categoria desconhecida cai numa regra neutra (nada restrito, nada automático)", () => {
    const rule = categoryRule("inventada")
    expect(rule).toMatchObject({ restricted: false, autoDelivery: false, declaresOrigin: false, stockReview: false })
    expect(rule.buyerFields).toEqual([])
    expect(isRestrictedCategory("inventada")).toBe(false)
  })

  it("as restritas são as que a moderação libera, e cada uma explica o que pergunta ao vendedor", () => {
    expect([...RESTRICTED_CATEGORY_SLUGS].sort()).toEqual(["assinaturas", "gift-cards", "keys", "recargas", "redes-sociais"])
    for (const slug of RESTRICTED_CATEGORY_SLUGS) {
      expect(categoryRule(slug).approvalPrompt.length, slug).toBeGreaterThan(20)
      expect(categoryRule(slug).sellerRules.length, slug).toBeGreaterThanOrEqual(3)
    }
  })

  it("análise de estoque só existe onde há entrega automática E a categoria é restrita", () => {
    for (const slug of CATEGORY_RULE_SLUGS) {
      const rule = categoryRule(slug)
      if (rule.stockReview) {
        expect(rule.autoDelivery, slug).toBe(true)
        expect(rule.restricted, slug).toBe(true)
      }
    }
    expect(categoryRule("gift-cards").stockReview).toBe(true)
    expect(categoryRule("contas").stockReview).toBe(false)
  })

  it("entrega automática e procedência vêm das regras", () => {
    for (const slug of ["gift-cards", "contas", "assinaturas", "keys", "redes-sociais", "cursos"]) expect(allowsAutoDelivery(slug), slug).toBe(true)
    for (const slug of ["moedas", "itens", "recargas", "boosting"]) expect(allowsAutoDelivery(slug), slug).toBe(false)
    expect(categoryRule("contas").declaresOrigin).toBe(true)
    expect(categoryRule("redes-sociais").declaresOrigin).toBe(true)
    expect(categoryRule("gift-cards").declaresOrigin).toBe(false)
  })

  it("os textos para quem compra e vende não prometem o que o sistema não faz", () => {
    for (const c of categories) {
      const text = `${c.name} ${c.tagline} ${c.description}`.toLowerCase()
      for (const word of BANNED) expect(text, `${c.slug}: ${word}`).not.toContain(word)
    }
    for (const slug of CATEGORY_RULE_SLUGS) {
      const rule = categoryRule(slug)
      const text = [...rule.sellerRules, rule.approvalPrompt].join(" ").toLowerCase()
      for (const word of BANNED) expect(text, `${slug}: ${word}`).not.toContain(word)
    }
  })

  it("o cabeçalho mostra só categorias que existem", () => {
    for (const slug of HEADER_CATEGORY_SLUGS) expect(getCategory(slug), slug).toBeDefined()
    expect(HEADER_CATEGORY_SLUGS.length).toBeLessThan(categories.length)
  })
})

describe("dados do comprador (sanitizeBuyerInfo)", () => {
  it("guarda só as chaves da categoria, limpa espaços e quebras de linha e corta no tamanho", () => {
    const { info, missing } = sanitizeBuyerInfo("recargas", { playerId: "  A\n\tB   C  ", server: "x".repeat(200), outro: "ignorado" })
    expect(missing).toBeNull()
    expect(info.playerId).toBe("A B C")
    expect(info.server).toHaveLength(60)
    expect(Object.keys(info).sort()).toEqual(["playerId", "server"])
  })

  it("devolve o primeiro campo obrigatório vazio", () => {
    expect(sanitizeBuyerInfo("recargas", {}).missing?.key).toBe("playerId")
    expect(sanitizeBuyerInfo("recargas", { playerId: "   " }).missing?.key).toBe("playerId")
    expect(sanitizeBuyerInfo("recargas", { playerId: "ok" }).missing).toBeNull()
    expect(sanitizeBuyerInfo("recargas", undefined).missing?.key).toBe("playerId")
  })

  it("categoria sem campos descarta tudo", () => {
    expect(sanitizeBuyerInfo("contas", { playerId: "x" })).toEqual({ info: {}, missing: null })
    expect(sanitizeBuyerInfo("boosting", {}).missing).toBeNull()
  })

  it("não aceita valor que não é texto", () => {
    const { info, missing } = sanitizeBuyerInfo("recargas", { playerId: 7 as unknown as string, server: ["a"] as unknown as string })
    expect(info).toEqual({})
    expect(missing?.key).toBe("playerId")
  })

  it("descreve com o rótulo de cada campo, na ordem da categoria", () => {
    expect(describeBuyerInfo("recargas", { server: "Brasil", playerId: "Fulano" })).toEqual([
      { label: "ID ou apelido no jogo", value: "Fulano" },
      { label: "Servidor ou região", value: "Brasil" },
    ])
  })
})

describe("tipos de produto do formulário do vendedor", () => {
  it("cada tipo aponta para uma categoria que existe e nenhuma categoria fica sem tipo", () => {
    for (const kind of Object.values(PRODUCT_KINDS)) expect(getCategory(kind.categorySlug), kind.id).toBeDefined()
    expect(new Set(Object.values(PRODUCT_KINDS).map((k) => k.categorySlug))).toEqual(new Set(categories.map((c) => c.slug)))
  })

  it("entrega automática sugerida só onde a categoria aceita", () => {
    for (const kind of Object.values(PRODUCT_KINDS)) {
      if (kind.deliveryType === "automatica") expect(allowsAutoDelivery(kind.categorySlug), kind.id).toBe(true)
    }
  })

  it("cada entrada de 'outras categorias' oferece só o tipo dela e todo jogo tem ao menos um tipo", () => {
    const byName = (name: string) => OUTRAS_CATEGORIAS.find((g) => g.name === name)!
    expect(productKindsForGame(byName("Assinaturas e Premium")).map((k) => k.id)).toEqual(["assinatura"])
    expect(productKindsForGame(byName("Redes Sociais")).map((k) => k.id)).toEqual(["rede_social"])
    expect(productKindsForGame(byName("Cursos e Treinamentos")).map((k) => k.id)).toEqual(["curso"])
    expect(productKindsForGame(byName("Gift Cards")).map((k) => k.id)).toEqual(["gift_card"])
    for (const game of [...GAMES, ...OUTRAS_CATEGORIAS]) expect(productKindsForGame(game).length, game.name).toBeGreaterThan(0)
  })

  it("jogos comuns oferecem item, recarga e conta; plataformas oferecem gift card e key", () => {
    const valorant = productKindsForGame(GAMES.find((g) => g.slug === "valorant")!).map((k) => k.categorySlug)
    expect(valorant).toEqual(expect.arrayContaining(["contas", "itens", "recargas", "boosting"]))
    const steam = productKindsForGame(GAMES.find((g) => g.slug === "steam")!).map((k) => k.categorySlug)
    expect(steam).toEqual(expect.arrayContaining(["gift-cards", "keys", "contas"]))
  })
})
