import { describe, expect, it } from "vitest"
import { centsToDecimal, csvCell, toCsv } from "@/lib/csv"

describe("csvCell", () => {
  it("aspas e ponto e vírgula protegem o campo; quebra de linha vira espaço", () => {
    expect(csvCell('Conta "Imortal"; BR')).toBe('"Conta ""Imortal""; BR"')
    expect(csvCell("linha 1\nlinha 2")).toBe("linha 1 linha 2")
    expect(csvCell(null)).toBe("")
    expect(csvCell(undefined)).toBe("")
    expect(csvCell(12.5)).toBe("12,5")
    expect(csvCell(Number.NaN)).toBe("")
  })

  it("injeção de fórmula: texto que começa com = + - @ ganha apóstrofo", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+55 11 99999", "-2+3", "@SUM(A1)", "\t=1+1", "\r=1+1"])
      expect(csvCell(evil).replace(/^"/, ""), evil).toMatch(/^'/)
    expect(csvCell("Conta =normal")).toBe("Conta =normal")
    // número negativo de verdade (tipo number) não é tratado como fórmula
    expect(csvCell(-5)).toBe("-5")
  })
})

describe("toCsv / centsToDecimal", () => {
  it("BOM, separador ; e CRLF", () => {
    const out = toCsv(["a", "b"], [["x", 1], ["y;z", null]])
    expect(out.startsWith("﻿")).toBe(true)
    expect(out).toBe("﻿a;b\r\nx;1\r\n\"y;z\";\r\n")
  })

  it("centavos viram decimal com vírgula, sem erro de arredondamento", () => {
    expect(centsToDecimal(0)).toBe("0,00")
    expect(centsToDecimal(5)).toBe("0,05")
    expect(centsToDecimal(123456)).toBe("1234,56")
    expect(centsToDecimal(-250)).toBe("-2,50")
  })
})
