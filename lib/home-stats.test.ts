import { describe, expect, it } from "vitest"
import {
  MIN_DELIVERIES_FOR_SPEED,
  MIN_REVIEWS_FOR_RATING,
  buildHeroStats,
  categoryCardInfo,
  formatDeliveryAverage,
  formatRatingAverage,
  type MarketStats,
} from "@/lib/home-stats"

const base: MarketStats = {
  activeListings: 9,
  approvedSellers: 5,
  reviewCount: 7,
  ratingAvg: 4.29,
  deliveredOrders: 10,
  avgDeliveryMinutes: 300,
}

describe("buildHeroStats", () => {
  it("com pouco volume mostra só contagens reais, sem nota nem prazo", () => {
    expect(buildHeroStats(base)).toEqual([
      { value: "9", label: "anúncios ativos" },
      { value: "5", label: "vendedores aprovados" },
    ])
  })

  it("só mostra a nota com avaliações suficientes, e com vírgula", () => {
    const a = buildHeroStats({ ...base, reviewCount: MIN_REVIEWS_FOR_RATING - 1 })
    expect(a.some((s) => s.label === "avaliação média")).toBe(false)
    const b = buildHeroStats({ ...base, reviewCount: MIN_REVIEWS_FOR_RATING })
    expect(b.at(-1)).toEqual({ value: "4,3/5", label: "avaliação média" })
  })

  it("usa o prazo médio quando falta volume de avaliações mas sobra de entregas", () => {
    const s = buildHeroStats({ ...base, deliveredOrders: MIN_DELIVERIES_FOR_SPEED })
    expect(s.at(-1)).toEqual({ value: "5 h", label: "entrega média" })
  })

  it("não inventa nada: sem dados, não há estatística", () => {
    expect(
      buildHeroStats({
        activeListings: 0,
        approvedSellers: 0,
        reviewCount: 0,
        ratingAvg: null,
        deliveredOrders: 0,
        avgDeliveryMinutes: null,
      }),
    ).toEqual([])
  })

  it("concorda o singular e formata milhar em pt-BR", () => {
    const s = buildHeroStats({ ...base, activeListings: 1, approvedSellers: 1 })
    expect(s[0]).toEqual({ value: "1", label: "anúncio ativo" })
    expect(s[1]).toEqual({ value: "1", label: "vendedor aprovado" })
    expect(buildHeroStats({ ...base, activeListings: 12480 })[0].value).toBe("12.480")
  })
})

describe("formatDeliveryAverage / formatRatingAverage", () => {
  it("escolhe a unidade natural", () => {
    expect(formatDeliveryAverage(0.2)).toBe("1 min")
    expect(formatDeliveryAverage(45)).toBe("45 min")
    expect(formatDeliveryAverage(300)).toBe("5 h")
    expect(formatDeliveryAverage(60 * 24 * 3)).toBe("3 dias")
    expect(formatDeliveryAverage(60 * 24 * 2)).toBe("2 dias")
  })

  it("nota com uma casa e vírgula", () => {
    expect(formatRatingAverage(4.5)).toBe("4,5/5")
    expect(formatRatingAverage(4.29)).toBe("4,3/5")
    expect(formatRatingAverage(5)).toBe("5,0/5")
  })
})

describe("categoryCardInfo", () => {
  it("sem anúncio vira 'Novo', sem preço inventado", () => {
    expect(categoryCardInfo(undefined)).toEqual({ countLabel: "Novo na Ellowin", fromCents: null })
    expect(categoryCardInfo({ count: 0, minPriceCents: 0 }).fromCents).toBeNull()
  })

  it("com anúncios mostra contagem e menor preço reais", () => {
    expect(categoryCardInfo({ count: 1, minPriceCents: 9990 })).toEqual({
      countLabel: "1 anúncio",
      fromCents: 9990,
    })
    expect(categoryCardInfo({ count: 5, minPriceCents: 2000 }).countLabel).toBe("5 anúncios")
  })
})
