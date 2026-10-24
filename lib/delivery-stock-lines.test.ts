import { describe, expect, it } from "vitest"
import {
  AUTO_DELIVERY_CATEGORIES,
  MAX_STOCK_BATCH,
  MAX_STOCK_ITEM_LENGTH,
  MIN_STOCK_ITEM_LENGTH,
  allowsAutoDelivery,
  maskStockItem,
  parseStockLines,
} from "@/lib/delivery-stock-lines"

describe("parseStockLines", () => {
  it("um item por linha, com espaços aparados, linhas vazias ignoradas e qualquer quebra de linha", () => {
    const r = parseStockLines("  ABCD-1111 \r\n\r\nEFGH-2222\nIJKL-3333\r")
    expect(r.items).toEqual(["ABCD-1111", "EFGH-2222", "IJKL-3333"])
    expect(r.errors).toEqual([])
  })

  it("repetidos no próprio envio são descartados e contados", () => {
    const r = parseStockLines("ABCD-1111\nABCD-1111\nEFGH-2222\nABCD-1111")
    expect(r.items).toEqual(["ABCD-1111", "EFGH-2222"])
    expect(r.duplicates).toBe(2)
  })

  it("fronteiras do tamanho do item: mínimo 4 e máximo 500 caracteres", () => {
    expect(parseStockLines("a".repeat(MIN_STOCK_ITEM_LENGTH - 1)).errors).toHaveLength(1)
    expect(parseStockLines("a".repeat(MIN_STOCK_ITEM_LENGTH)).errors).toEqual([])
    expect(parseStockLines("a".repeat(MAX_STOCK_ITEM_LENGTH)).errors).toEqual([])
    expect(parseStockLines("a".repeat(MAX_STOCK_ITEM_LENGTH + 1)).errors).toHaveLength(1)
  })

  it("aponta o número da linha (contando as vazias) e recusa o marcador de dado cifrado", () => {
    const r = parseStockLines("ABCD-1111\n\nabc\nenc:v1:xyz-zzzz")
    expect(r.errors).toEqual([
      `Linha 3: o item precisa ter ao menos ${MIN_STOCK_ITEM_LENGTH} caracteres.`,
      "Linha 4: o item não pode começar com enc:v1:.",
    ])
  })

  it("teto de itens por envio", () => {
    const many = Array.from({ length: MAX_STOCK_BATCH + 1 }, (_, i) => `ITEM-${String(i).padStart(5, "0")}`).join("\n")
    expect(parseStockLines(many).errors).toHaveLength(1)
    const ok = Array.from({ length: MAX_STOCK_BATCH }, (_, i) => `ITEM-${String(i).padStart(5, "0")}`).join("\n")
    expect(parseStockLines(ok).errors).toEqual([])
  })
})

describe("maskStockItem", () => {
  it("item longo mostra 2 + 2 caracteres; curto só pontos", () => {
    expect(maskStockItem("ABCDEFGHIJ")).toBe("AB••••IJ")
    expect(maskStockItem("ABCDEFGHI")).toBe("••••••")
  })
})

describe("allowsAutoDelivery", () => {
  it("só gift cards e contas", () => {
    expect([...AUTO_DELIVERY_CATEGORIES]).toEqual(["gift-cards", "contas"])
    expect(allowsAutoDelivery("gift-cards")).toBe(true)
    expect(allowsAutoDelivery("contas")).toBe(true)
    expect(allowsAutoDelivery("moedas")).toBe(false)
    expect(allowsAutoDelivery("boosting")).toBe(false)
    expect(allowsAutoDelivery("")).toBe(false)
  })
})
