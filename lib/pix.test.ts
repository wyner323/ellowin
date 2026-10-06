import { describe, expect, it } from "vitest"
import { formatRemaining, maskPixKey } from "@/lib/pix"

describe("maskPixKey", () => {
  it("esconde o começo e o fim do CPF", () => {
    expect(maskPixKey("cpf", "12345678909")).toBe("***.456.789-**")
    expect(maskPixKey("cpf", "123.456.789-09")).toBe("***.456.789-**")
  })

  it("mostra só o começo do e-mail e o domínio", () => {
    expect(maskPixKey("email", "joao.silva@gmail.com")).toBe("jo***@gmail.com")
    expect(maskPixKey("email", "a@x.com")).toBe("a***@x.com")
  })

  it("mostra DDD e os 4 últimos dígitos do telefone", () => {
    expect(maskPixKey("telefone", "(11) 98765-4321")).toBe("(11) *****-4321")
  })

  it("abrevia a chave aleatória", () => {
    expect(maskPixKey("aleatoria", "123e4567-e89b-12d3-a456-426614174000")).toBe("123e…4000")
  })

  it("nunca devolve a chave inteira quando o formato é inesperado", () => {
    expect(maskPixKey("cpf", "123")).toBe("***")
    expect(maskPixKey("email", "semarroba")).toBe("***")
    expect(maskPixKey("outro", "qualquercoisa")).toBe("***")
    expect(maskPixKey(null, null)).toBe("—")
  })
})

describe("formatRemaining", () => {
  it("arredonda para cima na unidade mais natural", () => {
    expect(formatRemaining(30)).toBe("1 minuto")
    expect(formatRemaining(40 * 60)).toBe("40 minutos")
    expect(formatRemaining(60 * 60)).toBe("1 hora")
    expect(formatRemaining(5 * 3600 + 10)).toBe("6 horas")
    expect(formatRemaining(23.5 * 3600)).toBe("24 horas")
  })
})
