import { describe, expect, it } from "vitest"
import { computeSellerBadges } from "@/lib/badges"

const base = { salesCount: 0, rating: null, ratingCount: 0, disputesCount: 0 }

describe("computeSellerBadges — selo por volume de vendas", () => {
  it("nenhum selo de vendas abaixo de 10", () => {
    expect(computeSellerBadges({ ...base, salesCount: 9 })).not.toContain("vendas_10")
  })

  it("vendas_10 a partir de 10, mas não vendas_50 ainda", () => {
    const badges = computeSellerBadges({ ...base, salesCount: 10 })
    expect(badges).toContain("vendas_10")
    expect(badges).not.toContain("vendas_50")
  })

  it("só o selo mais alto aparece (50 não empilha com 10)", () => {
    const badges = computeSellerBadges({ ...base, salesCount: 50 })
    expect(badges).toContain("vendas_50")
    expect(badges).not.toContain("vendas_10")
  })

  it("vendas_500 no topo", () => {
    const badges = computeSellerBadges({ ...base, salesCount: 500 })
    expect(badges).toContain("vendas_500")
    expect(badges).not.toContain("vendas_100")
  })
})

describe("computeSellerBadges — bem_avaliado", () => {
  it("exige nota >= 4.8 E pelo menos 5 avaliações", () => {
    expect(
      computeSellerBadges({ ...base, rating: 4.8, ratingCount: 4 }),
    ).not.toContain("bem_avaliado")
    expect(
      computeSellerBadges({ ...base, rating: 4.79, ratingCount: 10 }),
    ).not.toContain("bem_avaliado")
    expect(
      computeSellerBadges({ ...base, rating: 4.8, ratingCount: 5 }),
    ).toContain("bem_avaliado")
  })
})

describe("computeSellerBadges — sem_disputas", () => {
  it("exige pelo menos 5 vendas e zero disputas", () => {
    expect(
      computeSellerBadges({ ...base, salesCount: 4, disputesCount: 0 }),
    ).not.toContain("sem_disputas")
    expect(
      computeSellerBadges({ ...base, salesCount: 5, disputesCount: 1 }),
    ).not.toContain("sem_disputas")
    expect(
      computeSellerBadges({ ...base, salesCount: 5, disputesCount: 0 }),
    ).toContain("sem_disputas")
  })
})
