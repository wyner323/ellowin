import { describe, expect, it } from "vitest"
import { currentMonth, effectiveFeePercent, fillMonths, monthKeys, monthName, totals, type StatementMonth } from "@/lib/statement-math"

describe("currentMonth", () => {
  it("é o mês de Brasília, não o de UTC (virada às 21h do dia 30)", () => {
    expect(currentMonth(new Date("2026-10-15T12:00:00Z"))).toBe("2026-10")
    expect(currentMonth(new Date("2026-11-01T02:59:59Z"))).toBe("2026-10") // 23:59 de 31/10 em Brasília
    expect(currentMonth(new Date("2026-11-01T03:00:00Z"))).toBe("2026-11") // 00:00 de 01/11 em Brasília
  })
})

describe("monthKeys", () => {
  it("do mais recente ao mais antigo, atravessando o ano", () => {
    expect(monthKeys("2026-02", 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"])
    expect(monthKeys("2026-10", 1)).toEqual(["2026-10"])
    expect(monthKeys("2026-10", 12).at(-1)).toBe("2025-11")
  })
})

describe("fillMonths", () => {
  const row = (month: string, sales = 1): StatementMonth => ({ month, sales, grossCents: 1000 * sales, feeCents: 80 * sales, netCents: 920 * sales })

  it("meses sem venda ficam zerados e a ordem é a da janela", () => {
    const filled = fillMonths([row("2026-08"), row("2026-10", 2)], ["2026-10", "2026-09", "2026-08"])
    expect(filled.map((m) => [m.month, m.sales])).toEqual([["2026-10", 2], ["2026-09", 0], ["2026-08", 1]])
    expect(filled[1]).toEqual({ month: "2026-09", sales: 0, grossCents: 0, feeCents: 0, netCents: 0 })
  })

  it("linhas fora da janela são descartadas", () => {
    expect(fillMonths([row("2020-01")], ["2026-10"]).map((m) => m.sales)).toEqual([0])
  })
})

describe("totals e taxa efetiva", () => {
  it("soma os meses", () => {
    expect(totals([
      { month: "a", sales: 2, grossCents: 2000, feeCents: 160, netCents: 1840 },
      { month: "b", sales: 1, grossCents: 500, feeCents: 40, netCents: 460 },
    ])).toEqual({ sales: 3, grossCents: 2500, feeCents: 200, netCents: 2300 })
    expect(totals([])).toEqual({ sales: 0, grossCents: 0, feeCents: 0, netCents: 0 })
  })

  it("taxa efetiva em %, nula sem venda", () => {
    expect(effectiveFeePercent(10_000, 800)).toBe(8)
    expect(effectiveFeePercent(0, 0)).toBeNull()
  })

  it("nome do mês em português", () => {
    expect(monthName("2026-10")).toBe("outubro de 2026")
    expect(monthName("2026-01")).toBe("janeiro de 2026")
  })
})
