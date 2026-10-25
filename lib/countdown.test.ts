import { describe, expect, it } from "vitest"
import { WARN_BELOW_MS, deliveryCountdown, formatSpan } from "@/lib/countdown"

const NOW = new Date("2026-10-26T12:00:00Z").getTime()
const MIN = 60_000
const HOUR = 60 * MIN

describe("formatSpan", () => {
  it("minutos, horas e dias, arredondando os minutos para cima", () => {
    expect(formatSpan(1)).toBe("1 min")
    expect(formatSpan(59 * MIN)).toBe("59 min")
    expect(formatSpan(60 * MIN)).toBe("1 h")
    expect(formatSpan(2 * HOUR + 15 * MIN)).toBe("2 h 15 min")
    expect(formatSpan(2 * HOUR + 15 * MIN + 1)).toBe("2 h 16 min")
    expect(formatSpan(47 * HOUR)).toBe("47 h")
    expect(formatSpan(48 * HOUR)).toBe("2 dias")
    expect(formatSpan(73 * HOUR)).toBe("3 dias")
  })
})

describe("deliveryCountdown", () => {
  it("longe do prazo: ok, com o tempo que falta", () => {
    expect(deliveryCountdown(NOW + 5 * HOUR, NOW)).toEqual({ state: "ok", text: "Faltam 5 h para o prazo" })
  })

  it("fronteira de 1 h: exatamente 1 h ainda é ok, 1 min a menos pede pressa", () => {
    expect(deliveryCountdown(NOW + WARN_BELOW_MS, NOW).state).toBe("ok")
    const warn = deliveryCountdown(NOW + WARN_BELOW_MS - MIN, NOW)
    expect(warn.state).toBe("atencao")
    expect(warn.text).toBe("Faltam 59 min: entregue logo")
  })

  it("no instante do prazo e depois: vencido, com há quanto tempo", () => {
    expect(deliveryCountdown(NOW, NOW).state).toBe("vencido")
    expect(deliveryCountdown(NOW - 30_000, NOW).text).toBe("Prazo vencido agora há pouco")
    expect(deliveryCountdown(NOW - 3 * HOUR - 10 * MIN, NOW)).toEqual({ state: "vencido", text: "Prazo vencido há 3 h 10 min" })
  })

  it("aceita Date e número", () => {
    expect(deliveryCountdown(new Date(NOW + 30 * MIN), new Date(NOW)).state).toBe("atencao")
  })
})
