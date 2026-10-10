import { describe, expect, it } from "vitest"
import {
  GAME_ATTRIBUTES,
  attributeFieldsFor,
  describeAttributes,
  sanitizeAttributes,
} from "@/lib/game-attributes"
import { findGameBySlug } from "@/lib/product-catalog"

const CATEGORY_SLUGS = ["contas", "moedas", "gift-cards", "boosting"]

describe("definições", () => {
  it("cada jogo definido existe no catálogo de jogos", () => {
    for (const slug of Object.keys(GAME_ATTRIBUTES)) {
      expect(findGameBySlug(slug), slug).not.toBeNull()
    }
  })

  it("chaves e valores são únicos, categorias existem e há no máximo 2 destaques por jogo", () => {
    for (const [slug, fields] of Object.entries(GAME_ATTRIBUTES)) {
      const keys = fields.map((f) => f.key)
      expect(new Set(keys).size, `${slug}: chaves repetidas`).toBe(keys.length)
      expect(fields.filter((f) => f.highlight).length, `${slug}: destaques`).toBeLessThanOrEqual(2)
      for (const field of fields) {
        const values = field.options.map((o) => o.value)
        expect(new Set(values).size, `${slug}.${field.key}: valores repetidos`).toBe(values.length)
        expect(field.options.length, `${slug}.${field.key}`).toBeGreaterThan(1)
        for (const c of field.categories) expect(CATEGORY_SLUGS).toContain(c)
      }
    }
  })
})

describe("attributeFieldsFor", () => {
  it("acha o jogo pelo nome livre, sem depender de caixa ou acento", () => {
    expect(attributeFieldsFor("Valorant", "contas").map((f) => f.key)).toEqual(["regiao", "rank", "skins"])
    expect(attributeFieldsFor("  VALORANT ", "contas")).toHaveLength(3)
  })

  it("só devolve os campos da categoria do anúncio", () => {
    expect(attributeFieldsFor("Valorant", "moedas")).toEqual([])
    expect(attributeFieldsFor("Steam", "gift-cards").map((f) => f.key)).toEqual(["regiao"])
    expect(attributeFieldsFor("Steam", "contas")).toEqual([])
  })

  it("jogo sem definição ou sem nome não tem campos", () => {
    expect(attributeFieldsFor("Roblox", "moedas")).toEqual([])
    expect(attributeFieldsFor(null, "contas")).toEqual([])
    expect(attributeFieldsFor("Valorant", undefined)).toEqual([])
  })
})

describe("sanitizeAttributes", () => {
  it("mantém só chaves e valores válidos", () => {
    const { attributes, missing } = sanitizeAttributes("Valorant", "contas", {
      regiao: "br",
      rank: "imortal",
      skins: "999",
      hack: "<script>",
    })
    expect(attributes).toEqual({ regiao: "br", rank: "imortal" })
    expect(missing).toBeNull()
  })

  it("aponta o primeiro campo obrigatório que faltou", () => {
    const { missing } = sanitizeAttributes("Valorant", "contas", { regiao: "br" })
    expect(missing?.key).toBe("rank")
  })

  it("campo opcional vazio não é falta", () => {
    expect(sanitizeAttributes("Valorant", "contas", { regiao: "br", rank: "ouro" }).missing).toBeNull()
  })

  it("entrada que não é objeto vira vazio, sem quebrar", () => {
    for (const raw of [null, undefined, "x", 3, ["a"]]) {
      const r = sanitizeAttributes("Counter Strike 2", "contas", raw)
      expect(r.attributes).toEqual({})
      expect(r.missing?.required).toBe(true)
    }
  })

  it("descarta tudo quando o jogo ou a categoria não têm campos", () => {
    expect(sanitizeAttributes("Roblox", "moedas", { rank: "ouro" })).toEqual({ attributes: {}, missing: null })
    expect(sanitizeAttributes("Valorant", "moedas", { rank: "ouro" })).toEqual({ attributes: {}, missing: null })
  })

  it("valor com tipo errado é rejeitado", () => {
    expect(sanitizeAttributes("Valorant", "contas", { regiao: 1, rank: ["ouro"] }).attributes).toEqual({})
  })
})

describe("describeAttributes", () => {
  it("traduz para rótulos na ordem da definição e marca os destaques", () => {
    const out = describeAttributes("Valorant", "contas", { skins: "30-59", rank: "imortal", regiao: "br" })
    expect(out.map((a) => a.value)).toEqual(["Brasil", "Imortal", "30 a 59"])
    expect(out.map((a) => a.highlight)).toEqual([true, true, false])
  })

  it("ignora valores que não existem mais e atributos vazios", () => {
    expect(describeAttributes("Valorant", "contas", { rank: "lendario" })).toEqual([])
    expect(describeAttributes("Valorant", "contas", null)).toEqual([])
    expect(describeAttributes("Valorant", "contas", {})).toEqual([])
  })
})
