import { describe, expect, it } from "vitest"
import { sealState, sealText } from "@/lib/seller-seal"

describe("sealState", () => {
  it("registros de conta recuperada vencem qualquer histórico", () => {
    const when = new Date("2026-10-01T12:00:00Z")
    expect(sealState({ flagCount: 2, completedSales: 500, lastFlaggedAt: when })).toEqual({ kind: "registros", count: 2, lastFlaggedAt: when })
    expect(sealState({ flagCount: 1, completedSales: 0 })).toMatchObject({ kind: "registros", lastFlaggedAt: null })
  })

  it("sem registros e sem vendas concluídas é vendedor NOVO, não certificado", () => {
    expect(sealState({ flagCount: 0, completedSales: 0 })).toEqual({ kind: "novo" })
    expect(sealState({ flagCount: 0, completedSales: -1 })).toEqual({ kind: "novo" })
  })

  it("sem registros e com vendas concluídas é certificado, com o número de vendas", () => {
    expect(sealState({ flagCount: 0, completedSales: 1 })).toEqual({ kind: "certificado", sales: 1 })
    expect(sealState({ flagCount: 0, completedSales: 42 })).toEqual({ kind: "certificado", sales: 42 })
  })
})

describe("sealText", () => {
  it("certificado fala do histórico, no singular e no plural", () => {
    expect(sealText({ kind: "certificado", sales: 1 })).toBe("Selo de Certificação: sem registros de conta recuperada em 1 venda concluída")
    expect(sealText({ kind: "certificado", sales: 12 })).toBe("Selo de Certificação: sem registros de conta recuperada em 12 vendas concluídas")
  })

  it("vendedor novo NÃO recebe o texto do selo", () => {
    const text = sealText({ kind: "novo" })
    expect(text).toContain("Vendedor novo")
    expect(text).not.toContain("Selo de Certificação")
  })

  it("com registros não há texto de selo (cada tela mostra o aviso próprio)", () => {
    expect(sealText({ kind: "registros", count: 1, lastFlaggedAt: null })).toBeNull()
  })
})
