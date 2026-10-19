import { describe, expect, it } from "vitest"
import { delta, formatCompact, formatPercent, goalProgress, movingAverage, niceScale, parsePeriod, pctChange, priceVsMarket, ratio, topWithOthers } from "@/lib/analytics-math"

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

describe("goalProgress", () => {
  const base = { goalCents: 100_000, daysInMonth: 30 }

  it("meta batida vale em qualquer dia do mês", () => {
    expect(goalProgress({ ...base, revenueCents: 100_000, dayOfMonth: 1 }).status).toBe("alcancada")
    expect(goalProgress({ ...base, revenueCents: 150_000, dayOfMonth: 20 })).toMatchObject({ status: "alcancada", remainingCents: 0, neededPerDayCents: null })
  })

  it("nos 2 primeiros dias é cedo para opinar", () => {
    expect(goalProgress({ ...base, revenueCents: 1_000, dayOfMonth: 2 }).status).toBe("inicio")
  })

  it("no ritmo × abaixo do ritmo pela projeção do mês", () => {
    // 15 dias, R$ 600 → projeta R$ 1.200 (≥ meta de R$ 1.000)
    const onTrack = goalProgress({ ...base, revenueCents: 60_000, dayOfMonth: 15 })
    expect(onTrack).toMatchObject({ status: "no_ritmo", projectedCents: 120_000, percent: 60, daysLeft: 15 })
    // 15 dias, R$ 300 → projeta R$ 600 (< meta)
    expect(goalProgress({ ...base, revenueCents: 30_000, dayOfMonth: 15 }).status).toBe("abaixo")
  })

  it("quanto falta por dia usa os dias que restam; no último dia não há 'por dia'", () => {
    expect(goalProgress({ ...base, revenueCents: 40_000, dayOfMonth: 20 }).neededPerDayCents).toBe(6_000)
    expect(goalProgress({ ...base, revenueCents: 40_000, dayOfMonth: 30 }).neededPerDayCents).toBeNull()
  })

  it("dia fora do mês é limitado (nunca divide por zero nem projeta além)", () => {
    expect(goalProgress({ ...base, revenueCents: 5_000, dayOfMonth: 0 }).projectedCents).toBe(150_000)
    expect(goalProgress({ ...base, revenueCents: 5_000, dayOfMonth: 99 }).daysLeft).toBe(0)
  })
})

describe("priceVsMarket", () => {
  it("compara com a mediana e classifica em abaixo, na média ou acima (±5%)", () => {
    expect(priceVsMarket(8_000, 10_000, 5)).toEqual({ pct: -20, verdict: "abaixo" })
    expect(priceVsMarket(10_300, 10_000, 5)?.verdict).toBe("na_media")
    expect(priceVsMarket(9_600, 10_000, 5)?.verdict).toBe("na_media")
    expect(priceVsMarket(13_000, 10_000, 5)).toEqual({ pct: 30, verdict: "acima" })
  })

  it("poucos concorrentes (menos de 3) ou dado faltando não mostram nada", () => {
    expect(priceVsMarket(8_000, 10_000, 2)).toBeNull()
    expect(priceVsMarket(null, 10_000, 5)).toBeNull()
    expect(priceVsMarket(8_000, null, 5)).toBeNull()
    expect(priceVsMarket(8_000, 0, 5)).toBeNull()
  })
})
