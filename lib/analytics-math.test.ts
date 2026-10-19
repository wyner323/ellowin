import { describe, expect, it } from "vitest"
import { delta, formatCompact, formatPercent, movingAverage, niceScale, parsePeriod, pctChange, ratio, topWithOthers } from "@/lib/analytics-math"

describe("parsePeriod", () => {
  it("aceita só 7, 30 e 90; o resto cai no padrão de 30 dias", () => {
    expect(parsePeriod("7")).toBe(7)
    expect(parsePeriod("90")).toBe(90)
    expect(parsePeriod(["7", "90"])).toBe(7)
    for (const bad of [undefined, "", "0", "-7", "31", "abc", "7; drop table"]) expect(parsePeriod(bad), String(bad)).toBe(30)
  })
})

describe("ratio / pctChange / delta", () => {
  it("nunca devolve NaN nem Infinity", () => {
    expect(ratio(5, 0)).toBeNull()
    expect(ratio(1, 4)).toBe(0.25)
    expect(pctChange(10, 0)).toBeNull()
    expect(pctChange(150, 100)).toBe(50)
    expect(pctChange(50, 100)).toBe(-50)
  })

  it("direção e diferença", () => {
    expect(delta(12, 10)).toEqual({ diff: 2, pct: 20, direction: "up" })
    expect(delta(8, 10)).toEqual({ diff: -2, pct: -20, direction: "down" })
    expect(delta(0, 0)).toEqual({ diff: 0, pct: null, direction: "flat" })
  })
})

describe("formatadores", () => {
  it("percentual em pt-BR, com sinal opcional e traço quando não há base", () => {
    expect(formatPercent(12.34)).toBe("12%")
    expect(formatPercent(3.456)).toBe("3,5%")
    expect(formatPercent(8, { sign: true })).toBe("+8%")
    expect(formatPercent(-8)).toBe("−8%")
    expect(formatPercent(null)).toBe("—")
    expect(formatPercent(Number.NaN)).toBe("—")
  })

  it("compacta milhares e milhões", () => {
    expect(formatCompact(0)).toBe("0")
    expect(formatCompact(950)).toBe("950")
    expect(formatCompact(1500)).toBe("1,5 mil")
    expect(formatCompact(2_000_000)).toBe("2 mi")
  })
})

describe("niceScale", () => {
  it("sempre cobre o máximo, com teto redondo e grade crescente", () => {
    for (const max of [1, 7, 99, 1234, 56_789, 3_200_000]) {
      const { top, ticks } = niceScale(max)
      expect(top, String(max)).toBeGreaterThanOrEqual(max)
      expect(ticks[0]).toBe(0)
      expect(ticks.at(-1)).toBe(top)
      expect(ticks.length).toBeGreaterThanOrEqual(3)
      expect([...ticks].sort((a, b) => a - b)).toEqual(ticks)
    }
    expect(niceScale(0)).toEqual({ top: 1, ticks: [0, 1] })
  })
})

describe("topWithOthers / movingAverage", () => {
  it("mantém os maiores e soma a cauda em 'Outros' (sem criar 'Outros' vazio)", () => {
    const rows = [{ label: "a", value: 5 }, { label: "b", value: 9 }, { label: "c", value: 1 }, { label: "d", value: 2 }]
    expect(topWithOthers(rows, 2)).toEqual([{ label: "b", value: 9 }, { label: "a", value: 5 }, { label: "Outros", value: 3 }])
    expect(topWithOthers(rows, 4)).toHaveLength(4)
  })

  it("média móvel com janela menor no começo", () => {
    expect(movingAverage([2, 4, 6, 8], 2)).toEqual([2, 3, 5, 7])
    expect(movingAverage([], 3)).toEqual([])
  })
})
