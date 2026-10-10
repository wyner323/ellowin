import { describe, expect, it } from "vitest"
import { INSTANT_DELIVERY_TIME } from "@/lib/delivery"
import {
  DEFAULT_LISTING_FILTERS,
  activeFilterCount,
  deliveryRuleFor,
  filtersToParams,
  isDefaultView,
  listingWindow,
  parseListingFilters,
} from "@/lib/listing-filters"

describe("parseListingFilters", () => {
  it("sem parâmetros devolve os padrões", () => {
    expect(parseListingFilters({})).toEqual(DEFAULT_LISTING_FILTERS)
  })

  it("lê ordem, preço, prazo, nível e avaliados", () => {
    const f = parseListingFilters({
      ordem: "menor-preco",
      min: "10",
      max: "1.234,50",
      entrega: "24h",
      nivel: "3",
      avaliados: "1",
    })
    expect(f).toEqual({
      sort: "menor-preco",
      minPriceCents: 1000,
      maxPriceCents: 123450,
      delivery: "24h",
      minLevel: 3,
      onlyReviewed: true,
    })
  })

  it("ignora valores inválidos em vez de quebrar", () => {
    const f = parseListingFilters({
      ordem: "'; drop table",
      min: "abc",
      max: "-5",
      entrega: "ontem",
      nivel: "99",
      avaliados: "sim",
    })
    expect(f.sort).toBe("recentes")
    expect(f.minPriceCents).toBeNull()
    expect(f.maxPriceCents).toBeNull()
    expect(f.delivery).toBe("qualquer")
    expect(f.minLevel).toBe(1)
    expect(f.onlyReviewed).toBe(false)
  })

  it("limita o nível a 5 e rejeita preço absurdo", () => {
    expect(parseListingFilters({ nivel: "9" }).minLevel).toBe(5)
    expect(parseListingFilters({ nivel: "0" }).minLevel).toBe(1)
    expect(parseListingFilters({ max: "99999999999" }).maxPriceCents).toBeNull()
  })

  it("troca a faixa de preço invertida", () => {
    const f = parseListingFilters({ min: "500", max: "100" })
    expect(f.minPriceCents).toBe(10000)
    expect(f.maxPriceCents).toBe(50000)
  })

  it("usa o primeiro valor quando o parâmetro se repete", () => {
    expect(parseListingFilters({ ordem: ["maior-preco", "menor-preco"] }).sort).toBe("maior-preco")
  })
})

describe("activeFilterCount / isDefaultView", () => {
  it("a ordenação não conta como filtro", () => {
    const f = parseListingFilters({ ordem: "avaliados" })
    expect(activeFilterCount(f)).toBe(0)
    expect(isDefaultView(f)).toBe(false)
  })

  it("faixa de preço conta uma vez, mesmo com min e max", () => {
    expect(activeFilterCount(parseListingFilters({ min: "1", max: "9" }))).toBe(1)
  })

  it("vitrine limpa só sem filtro e na ordem padrão", () => {
    expect(isDefaultView(DEFAULT_LISTING_FILTERS)).toBe(true)
    expect(isDefaultView(parseListingFilters({ nivel: "2" }))).toBe(false)
  })
})

describe("filtersToParams", () => {
  it("omite os padrões", () => {
    expect(Object.values(filtersToParams(DEFAULT_LISTING_FILTERS)).every((v) => v === undefined)).toBe(true)
  })

  it("ida e volta preserva os filtros", () => {
    const original = parseListingFilters({
      ordem: "vendidos",
      min: "12,50",
      max: "300",
      entrega: "imediata",
      nivel: "4",
      avaliados: "1",
    })
    const params = filtersToParams(original)
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined))
    expect(parseListingFilters(clean)).toEqual(original)
  })
})

describe("listingWindow", () => {
  // 30 reais + 8 demonstração, páginas de 24: 38 itens, 2 páginas.
  it("primeira página: só reais", () => {
    expect(listingWindow(30, 0, 24)).toEqual({ realOffset: 0, realLimit: 24, demoStart: 0 })
  })

  it("página que atravessa a fronteira: reais restantes e começo da demonstração", () => {
    expect(listingWindow(30, 24, 24)).toEqual({ realOffset: 24, realLimit: 6, demoStart: 0 })
  })

  it("página só de demonstração: nenhum real e fatia contínua", () => {
    expect(listingWindow(20, 24, 24)).toEqual({ realOffset: 20, realLimit: 0, demoStart: 4 })
  })

  it("sem anúncios reais, tudo é demonstração", () => {
    expect(listingWindow(0, 0, 24)).toEqual({ realOffset: 0, realLimit: 0, demoStart: 0 })
  })

  it("nenhum item é pulado nem repetido entre páginas", () => {
    const realTotal = 30
    const demoTotal = 8
    const seen: string[] = []
    for (let page = 0; page < 2; page++) {
      const { realOffset, realLimit, demoStart } = listingWindow(realTotal, page * 24, 24)
      for (let i = 0; i < realLimit; i++) seen.push(`r${realOffset + i}`)
      const demoCount = Math.min(24 - realLimit, demoTotal - demoStart)
      for (let i = 0; i < demoCount; i++) seen.push(`d${demoStart + i}`)
    }
    expect(seen).toHaveLength(realTotal + demoTotal)
    expect(new Set(seen).size).toBe(realTotal + demoTotal)
  })
})

describe("deliveryRuleFor", () => {
  it("qualquer prazo não filtra", () => {
    expect(deliveryRuleFor("qualquer")).toBeNull()
  })

  it("imediata aceita só a entrega automática (pelo tipo, sem depender do texto)", () => {
    expect(deliveryRuleFor("imediata")).toEqual({ automatic: true, labels: [] })
  })

  it("até 24h inclui a automática e as janelas de até 24 horas, sem 48/72", () => {
    const rule = deliveryRuleFor("24h")!
    expect(rule.automatic).toBe(true)
    const labels = rule.labels
    expect(labels).toContain(INSTANT_DELIVERY_TIME)
    expect(labels).toContain("ate 24h")
    expect(labels).not.toContain("ate 48h")
    expect(labels).toContain("Até 30 minutos")
    expect(labels).toContain("Até 24 horas")
    expect(labels).not.toContain("Até 48 horas")
    expect(labels).not.toContain("Até 72 horas")
  })
})
