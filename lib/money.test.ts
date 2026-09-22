import { describe, expect, it } from "vitest"
import {
  feeForCents,
  formatCents,
  formatRating,
  parseToCents,
  splitOrderAmount,
} from "@/lib/money"

// `toLocaleString` com style: "currency" insere um espaço não separável
// (U+00A0) entre "R$" e o valor, não um espaço comum.
const NBSP = " "

describe("formatCents", () => {
  it("formata centavos como moeda pt-BR", () => {
    expect(formatCents(19990)).toBe(`R$${NBSP}199,90`)
    expect(formatCents(0)).toBe(`R$${NBSP}0,00`)
    expect(formatCents(100)).toBe(`R$${NBSP}1,00`)
  })
})

describe("parseToCents", () => {
  it("aceita o formato pt-BR com separador de milhar e vírgula decimal", () => {
    expect(parseToCents("1.234,56")).toBe(123456)
  })

  it("aceita ponto decimal sem separador de milhar", () => {
    expect(parseToCents("1234.56")).toBe(123456)
  })

  it("aceita valor inteiro sem separador", () => {
    expect(parseToCents("1234")).toBe(123400)
  })

  it("rejeita string vazia", () => {
    expect(parseToCents("")).toBeNull()
    expect(parseToCents("   ")).toBeNull()
  })

  it("rejeita valor negativo", () => {
    expect(parseToCents("-10")).toBeNull()
  })

  it("rejeita lixo não numérico", () => {
    expect(parseToCents("abc")).toBeNull()
  })

  it("arredonda pra o centavo mais próximo", () => {
    expect(parseToCents("10,005")).toBe(1001)
  })
})

describe("feeForCents", () => {
  it("aplica 8% (800 bps)", () => {
    expect(feeForCents(10000)).toBe(800)
  })

  it("arredonda em vez de truncar", () => {
    expect(feeForCents(1)).toBe(0)
    expect(feeForCents(100)).toBe(8)
  })
})

describe("splitOrderAmount", () => {
  it("taxa + líquido sempre fecham exatamente o valor total (sem drift de arredondamento)", () => {
    for (const amountCents of [1, 7, 99, 100, 1990, 15000, 999999, 123456789]) {
      const { feeCents, sellerNetCents } = splitOrderAmount(amountCents)
      expect(feeCents + sellerNetCents).toBe(amountCents)
    }
  })
})

describe("formatRating", () => {
  it("retorna null sem avaliações", () => {
    expect(formatRating(0, 0)).toBeNull()
  })

  it("calcula a média arredondada em uma casa decimal", () => {
    expect(formatRating(9, 2)).toBe(4.5)
    expect(formatRating(14, 3)).toBe(4.7)
  })
})
