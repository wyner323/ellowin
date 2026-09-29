import { describe, expect, it } from "vitest"
import { scrubSensitiveData } from "@/lib/sentry-scrub"

describe("scrubSensitiveData", () => {
  it("redige campos sensíveis pelo nome, sem distinguir maiúsculas/minúsculas", () => {
    const out = scrubSensitiveData({
      cpf: "12345678909",
      CPF: "12345678909",
      password: "hunter2",
      deliveryPayload: "login: x / senha: y",
      pixKey: "chave@pix.com",
      documentNumber: "12345",
      token: "abc",
    })
    expect(out).toEqual({
      cpf: "[redacted]",
      CPF: "[redacted]",
      password: "[redacted]",
      deliveryPayload: "[redacted]",
      pixKey: "[redacted]",
      documentNumber: "[redacted]",
      token: "[redacted]",
    })
  })

  it("preserva campos não sensíveis intactos, incluindo aninhados e arrays", () => {
    const out = scrubSensitiveData({
      orderId: 42,
      buyer: { displayName: "Joaozinz", cpf: "111" },
      items: [{ label: "x", password: "y" }, { label: "z" }],
    })
    expect(out).toEqual({
      orderId: 42,
      buyer: { displayName: "Joaozinz", cpf: "[redacted]" },
      items: [{ label: "x", password: "[redacted]" }, { label: "z" }],
    })
  })

  it("não estoura em referência circular nem em valores primitivos", () => {
    expect(scrubSensitiveData("texto simples")).toBe("texto simples")
    expect(scrubSensitiveData(42)).toBe(42)
    expect(scrubSensitiveData(null)).toBeNull()

    const circular: Record<string, unknown> = { cpf: "111" }
    circular.self = circular
    const out = scrubSensitiveData(circular, 0) as Record<string, unknown>
    expect(out.cpf).toBe("[redacted]")
    // a profundidade máxima interrompe antes de recursão infinita
    expect(() => scrubSensitiveData(circular)).not.toThrow()
  })
})
