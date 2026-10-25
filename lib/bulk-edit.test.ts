import { describe, expect, it } from "vitest"
import { MAX_PERCENT, MIN_PERCENT, applyPercent, diffChanges, parseChange, parsePercent } from "@/lib/bulk-edit"
import { MAX_PRICE_CENTS, MAX_STOCK, MAX_TITLE, copyTitle } from "@/lib/listing-checks"

describe("parsePercent", () => {
  it("aceita inteiro, decimal com vírgula ou ponto e sinal", () => {
    expect(parsePercent("10")).toBe(10)
    expect(parsePercent(" -5,5 ")).toBe(-5.5)
    expect(parsePercent("+12.5")).toBe(12.5)
    expect(parsePercent("0")).toBe(0)
  })

  it("recusa lixo e fora da faixa (−90 a 1000)", () => {
    for (const bad of ["", "abc", "10%", "1e3", "--5", "5,,5", "NaN"]) expect(parsePercent(bad), bad).toBeNull()
    expect(parsePercent(String(MIN_PERCENT))).toBe(MIN_PERCENT)
    expect(parsePercent(String(MIN_PERCENT - 1))).toBeNull()
    expect(parsePercent(String(MAX_PERCENT))).toBe(MAX_PERCENT)
    expect(parsePercent(String(MAX_PERCENT + 1))).toBeNull()
  })
})

describe("applyPercent", () => {
  it("soma a porcentagem e arredonda ao centavo", () => {
    expect(applyPercent(10_000, 10)).toBe(11_000)
    expect(applyPercent(10_000, -10)).toBe(9_000)
    expect(applyPercent(4_990, 10)).toBe(5_489) // 5489,0
    expect(applyPercent(999, 15)).toBe(1_149) // 1148,85 → 1149
    expect(applyPercent(1_001, 0.1)).toBe(1_002) // 1002,001
  })

  it("nunca passa do teto nem fica abaixo de R$ 1,00", () => {
    expect(applyPercent(150, -90)).toBe(100)
    expect(applyPercent(MAX_PRICE_CENTS, 50)).toBe(MAX_PRICE_CENTS)
    expect(applyPercent(100, -50)).toBe(100)
  })
})

describe("diffChanges", () => {
  const rows = [
    { variantId: 1, priceCents: 4_990, stock: 3 },
    { variantId: 2, priceCents: 10_000, stock: 0 },
    { variantId: 3, priceCents: 500, stock: 9 },
  ]

  it("só devolve o que mudou de verdade, e só o campo que mudou", () => {
    const changes = diffChanges(rows, {
      1: { price: "49,90", stock: "3" }, // igual
      2: { price: "100,00", stock: "5" }, // estoque mudou
      3: { price: "5,50", stock: "9" }, // preço mudou
    })
    expect(changes).toEqual([
      { variantId: 2, stock: "5" },
      { variantId: 3, price: "5,50" },
    ])
  })

  it("o mesmo valor escrito de outro jeito não é mudança", () => {
    expect(diffChanges(rows, { 1: { price: "49.9", stock: "3" } })).toEqual([])
    expect(diffChanges(rows, { 1: { price: "R$ 49,90", stock: " 3 " } })).toEqual([])
  })

  it("campo ilegível não vira mudança (o servidor nem chega a ver)", () => {
    expect(diffChanges(rows, { 1: { price: "abc", stock: "x" } })).toEqual([])
    expect(diffChanges(rows, { 1: { price: "", stock: "" } })).toEqual([])
  })

  it("linha sem edição é ignorada", () => {
    expect(diffChanges(rows, {})).toEqual([])
  })
})

describe("parseChange", () => {
  it("valida preço (R$ 1,00 a R$ 100.000,00) e estoque (0 a 100.000)", () => {
    expect(parseChange({ variantId: 1, price: "49,90", stock: "10" })).toEqual({ priceCents: 4_990, stock: 10 })
    expect(parseChange({ variantId: 1, price: "0,99" })).toEqual({ error: "O preço mínimo é R$ 1,00." })
    expect(parseChange({ variantId: 1, price: "1,00" })).toEqual({ priceCents: 100 })
    expect(parseChange({ variantId: 1, price: String(MAX_PRICE_CENTS / 100) })).toEqual({ priceCents: MAX_PRICE_CENTS })
    expect(parseChange({ variantId: 1, price: String(MAX_PRICE_CENTS / 100 + 1) }).error).toContain("máximo")
    expect(parseChange({ variantId: 1, stock: "0" })).toEqual({ stock: 0 })
    expect(parseChange({ variantId: 1, stock: String(MAX_STOCK) })).toEqual({ stock: MAX_STOCK })
    expect(parseChange({ variantId: 1, stock: String(MAX_STOCK + 1) }).error).toContain("estoque")
  })

  it("estoque tem de ser só dígitos: 1.5, -1 e 10abc são recusados", () => {
    for (const bad of ["1.5", "-1", "10abc", "", " "]) expect(parseChange({ variantId: 1, stock: bad }).error, bad).toBeDefined()
  })

  it("mudança vazia é recusada", () => {
    expect(parseChange({ variantId: 1 })).toEqual({ error: "Nada para alterar." })
  })
})

describe("copyTitle", () => {
  it("acrescenta (cópia) e corta o original quando passaria do máximo", () => {
    expect(copyTitle("  Conta Valorant  ")).toBe("Conta Valorant (cópia)")
    const long = "x".repeat(MAX_TITLE)
    const cut = copyTitle(long)
    expect(cut.length).toBeLessThanOrEqual(MAX_TITLE)
    expect(cut.endsWith(" (cópia)")).toBe(true)
    expect(copyTitle("x".repeat(MAX_TITLE - 8)).length).toBe(MAX_TITLE)
  })
})
