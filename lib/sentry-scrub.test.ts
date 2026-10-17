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

  it("limpa o CONTEÚDO dos textos: a mensagem de erro do Drizzle perde os parâmetros ligados, mas mantém o SQL", () => {
    const out = scrubSensitiveData({
      exception: {
        values: [{ value: "Failed query: insert into \"profile\" (\"cpf\", \"phone\") values ($1, $2)\nparams: 52998224725,(11) 99999-1111,01/01/1990" }],
      },
    }) as { exception: { values: { value: string }[] } }
    const message = out.exception.values[0].value
    expect(message).toContain('insert into "profile"')
    expect(message).toContain("params: [redacted]")
    expect(message).not.toContain("52998224725")
    expect(message).not.toContain("99999-1111")
  })

  it("tira token de URL, CPF solto e e-mail de qualquer texto (caminho, breadcrumb, mensagem)", () => {
    const out = scrubSensitiveData({
      contexts: { nextjs: { request_path: "/redefinir-senha?token=ABC123SEGREDO&x=1" } },
      breadcrumbs: [{ message: "CPF 529.982.247-25 e 52998224725, contato ana@teste.dev" }],
    }) as { contexts: { nextjs: { request_path: string } }; breadcrumbs: { message: string }[] }
    expect(out.contexts.nextjs.request_path).toBe("/redefinir-senha?token=[redacted]&x=1")
    expect(out.breadcrumbs[0].message).toBe("CPF [redacted] e [redacted], contato [redacted]")
  })

  it("não mexe em texto comum nem em números que não são CPF", () => {
    expect(scrubSensitiveData("pedido #101 do anúncio 12345 falhou em 2026-10-17")).toBe("pedido #101 do anúncio 12345 falhou em 2026-10-17")
    expect(scrubSensitiveData("timestamp 1760000000000")).toBe("timestamp 1760000000000") // 13 dígitos: não é CPF nem celular
  })

  it("não estraga caminhos de pacote nas pilhas de erro (pacote@versão não é e-mail)", () => {
    const frame = "node_modules/.pnpm/better-auth@1.6.25_@opentel_abc/node_modules/better-auth/dist/api/index.mjs"
    expect(scrubSensitiveData(frame)).toBe(frame)
    expect(scrubSensitiveData("falha para ana.silva@exemplo.com.br agora")).toBe("falha para [redacted] agora")
  })

  it("objetos além da profundidade máxima não passam sem filtro", () => {
    let deep: Record<string, unknown> = { cpf: "52998224725", texto: "52998224725" }
    for (let i = 0; i < 10; i++) deep = { filho: deep }
    expect(JSON.stringify(scrubSensitiveData(deep))).not.toContain("52998224725")
  })

  it("campos de contato e de nascimento também são redigidos pelo nome", () => {
    expect(scrubSensitiveData({ phone: "11999991111", email: "a@b.co", birthDate: "01/01/1990", fullName: "Ana Silva" })).toEqual({
      phone: "[redacted]",
      email: "[redacted]",
      birthDate: "[redacted]",
      fullName: "[redacted]",
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
