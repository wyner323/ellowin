import { describe, expect, it } from "vitest"
import { areaPath, bandCenter, linePath, longDate, nearestIndex, scaleY, shortDate, xTickIndexes } from "@/lib/chart-geometry"

describe("escalas", () => {
  it("scaleY: zero na base, máximo no topo, e nunca fora do quadro", () => {
    expect(scaleY(0, 100, 10, 110)).toBe(110)
    expect(scaleY(100, 100, 10, 110)).toBe(10)
    expect(scaleY(50, 100, 10, 110)).toBe(60)
    expect(scaleY(-5, 100, 10, 110)).toBe(110)
    expect(scaleY(5, 0, 10, 110)).toBe(110)
  })

  it("bandCenter divide a largura em faixas iguais", () => {
    expect(bandCenter(0, 4, 0, 100)).toBe(12.5)
    expect(bandCenter(3, 4, 0, 100)).toBe(87.5)
  })

  it("nearestIndex acha a faixa do ponteiro, limitada às pontas", () => {
    expect(nearestIndex(-20, 10, 0, 100)).toBe(0)
    expect(nearestIndex(55, 10, 0, 100)).toBe(5)
    expect(nearestIndex(500, 10, 0, 100)).toBe(9)
    expect(nearestIndex(10, 1, 0, 100)).toBe(0)
  })
})

describe("caminhos", () => {
  it("linha e área fecham na base", () => {
    const pts = [{ x: 0, y: 10 }, { x: 10, y: 5 }]
    expect(linePath(pts)).toBe("M0 10 L10 5")
    expect(areaPath(pts, 20)).toBe("M0 10 L10 5 L10 20 L0 20 Z")
    expect(linePath([])).toBe("")
    expect(areaPath([], 20)).toBe("")
  })
})

describe("rótulos do eixo X", () => {
  it("sempre inclui primeiro e último, sem passar do máximo", () => {
    expect(xTickIndexes(5, 6)).toEqual([0, 1, 2, 3, 4])
    for (const n of [7, 14, 30, 90]) {
      const ticks = xTickIndexes(n, 5)
      expect(ticks[0]).toBe(0)
      expect(ticks.at(-1)).toBe(n - 1)
      expect(ticks.length).toBeLessThanOrEqual(5)
      expect(new Set(ticks).size).toBe(ticks.length)
    }
    expect(xTickIndexes(0, 5)).toEqual([])
  })

  it("datas sem erro de fuso", () => {
    expect(shortDate("2026-10-05")).toBe("05/10")
    expect(longDate("2026-10-05")).toMatch(/^5 de out/)
    expect(longDate("2026-01-01")).toMatch(/^1 de jan/)
  })
})
