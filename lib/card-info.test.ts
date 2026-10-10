import { describe, expect, it } from "vitest"
import { positivePercent, stockHint } from "@/lib/card-info"

describe("positivePercent", () => {
  it("esconde com poucas avaliações", () => {
    expect(positivePercent(1, 1)).toBeNull()
    expect(positivePercent(4, 4)).toBeNull()
  })

  it("arredonda a partir de 5 avaliações", () => {
    expect(positivePercent(5, 5)).toBe(100)
    expect(positivePercent(4, 5)).toBe(80)
    expect(positivePercent(2, 3 + 3)).toBe(33)
  })

  it("nunca passa de 100%", () => {
    expect(positivePercent(9, 5)).toBe(100)
  })
})

describe("stockHint", () => {
  it("avisa só quando falta pouco", () => {
    expect(stockHint(1)).toBe("Última unidade")
    expect(stockHint(3)).toBe("Últimas 3 unidades")
    expect(stockHint(5)).toBe("Últimas 5 unidades")
  })

  it("silêncio para estoque folgado, zerado ou desconhecido", () => {
    expect(stockHint(6)).toBeNull()
    expect(stockHint(0)).toBeNull()
    expect(stockHint(null)).toBeNull()
  })
})
