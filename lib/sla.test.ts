import { afterEach, describe, expect, it, vi } from "vitest"
import { addBusinessHours, disputeDeadlines, slaState } from "@/lib/sla"

describe("addBusinessHours", () => {
  it("soma horas dentro do mesmo dia útil sem pular nada", () => {
    // Segunda-feira, 10h UTC.
    const start = new Date(Date.UTC(2026, 8, 21, 10, 0, 0))
    const result = addBusinessHours(start, 4)
    expect(result.toISOString()).toBe(new Date(Date.UTC(2026, 8, 21, 14, 0, 0)).toISOString())
  })

  it("pula o fim de semana inteiro", () => {
    // Sexta-feira, 20h UTC — 8h úteis restantes na sexta (até meia-noite),
    // então o resto vira segunda de manhã, sem contar sábado/domingo.
    const start = new Date(Date.UTC(2026, 8, 25, 20, 0, 0)) // sexta
    const result = addBusinessHours(start, 10)
    // 4h até virar sábado (00h) + 6h restantes só contam a partir de segunda 00h.
    expect(result.getUTCDay()).not.toBe(0) // não cai domingo
    expect(result.getUTCDay()).not.toBe(6) // não cai sábado
    expect(result.toISOString()).toBe(new Date(Date.UTC(2026, 8, 28, 6, 0, 0)).toISOString()) // segunda 06h
  })

  it("nunca aterrissa num sábado ou domingo", () => {
    const start = new Date(Date.UTC(2026, 8, 21, 0, 0, 0)) // segunda
    for (let hours = 1; hours <= 200; hours++) {
      const result = addBusinessHours(start, hours)
      const day = result.getUTCDay()
      expect(day).not.toBe(0)
      expect(day).not.toBe(6)
    }
  })
})

describe("disputeDeadlines", () => {
  it("calcula os três prazos (24h / 48h / 48h úteis) a partir da abertura", () => {
    const openedAt = new Date(Date.UTC(2026, 8, 21, 10, 0, 0)) // segunda
    const deadlines = disputeDeadlines(openedAt)

    expect(deadlines.firstContactDueAt.getTime()).toBe(
      addBusinessHours(openedAt, 24).getTime(),
    )
    expect(deadlines.sellerResponseDueAt.getTime()).toBe(
      addBusinessHours(openedAt, 48).getTime(),
    )
    expect(deadlines.resolutionDueAt.getTime()).toBe(
      addBusinessHours(openedAt, 48).getTime(),
    )
    // Resposta do vendedor e resolução final coincidem (ambos 48h úteis).
    expect(deadlines.sellerResponseDueAt.getTime()).toBe(deadlines.resolutionDueAt.getTime())
  })
})

describe("slaState", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("encerrado quando o status já é resolvido ou cancelado, mesmo com prazo vencido", () => {
    const past = new Date(Date.now() - 1000)
    expect(slaState({ status: "resolvida_comprador", resolutionDueAt: past })).toBe("encerrado")
    expect(slaState({ status: "resolvida_vendedor", resolutionDueAt: past })).toBe("encerrado")
    expect(slaState({ status: "cancelada", resolutionDueAt: past })).toBe("encerrado")
  })

  it("atrasado quando o prazo já passou", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 22, 12, 0, 0)))
    const resolutionDueAt = new Date(Date.UTC(2026, 8, 22, 11, 0, 0))
    expect(slaState({ status: "aberta", resolutionDueAt })).toBe("atrasado")
  })

  it("atenção quando faltam menos de 12h", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 22, 12, 0, 0)))
    const resolutionDueAt = new Date(Date.UTC(2026, 8, 22, 20, 0, 0)) // faltam 8h
    expect(slaState({ status: "em_analise", resolutionDueAt })).toBe("atencao")
  })

  it("no prazo quando faltam 12h ou mais", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 22, 12, 0, 0)))
    const resolutionDueAt = new Date(Date.UTC(2026, 8, 23, 12, 0, 1)) // faltam 24h+
    expect(slaState({ status: "aberta", resolutionDueAt })).toBe("no_prazo")
  })
})
