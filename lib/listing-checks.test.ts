import { describe, expect, it } from "vitest"
import { isListingReady, isRowValid, listingChecks, type ListingDraft } from "@/lib/listing-checks"

const good: ListingDraft = {
  title: "Conta Valorant Imortal",
  categorySlug: "moedas",
  description: "Entrega rápida, conta com todas as skins incluídas.",
  accountOrigin: "",
  rows: [{ label: "1.000 VP", price: "49,90", stock: "3" }],
}

const failing = (draft: ListingDraft) =>
  listingChecks(draft, 0).filter((c) => c.required && !c.ok).map((c) => c.key)

describe("listingChecks", () => {
  it("anúncio completo passa (foto é só recomendação)", () => {
    const checks = listingChecks(good, 0)
    expect(isListingReady(checks)).toBe(true)
    expect(checks.find((c) => c.key === "photos")).toMatchObject({ ok: false, required: false })
    expect(listingChecks(good, 2).find((c) => c.key === "photos")?.ok).toBe(true)
  })

  it("aponta exatamente o que falta, no mesmo limite do servidor", () => {
    expect(failing({ ...good, title: "1234567" })).toEqual(["title"]) // 7 < 8
    expect(failing({ ...good, title: "12345678" })).toEqual([])
    expect(failing({ ...good, description: "x".repeat(19) })).toEqual(["description"])
    expect(failing({ ...good, description: "x".repeat(20) })).toEqual([])
    expect(failing({ ...good, categorySlug: "" })).toEqual(["category"])
  })

  it("procedência só é exigida na categoria contas", () => {
    expect(failing({ ...good, categorySlug: "contas" })).toEqual(["origin"])
    expect(failing({ ...good, categorySlug: "contas", accountOrigin: "criador_sem_recuperacao" })).toEqual([])
  })

  it("itens: nome ≥ 2, preço ≥ R$ 1,00, estoque ≥ 0 e inteiro", () => {
    expect(isRowValid({ label: "ok", price: "1,00", stock: "0" })).toBe(true)
    expect(isRowValid({ label: "o", price: "10", stock: "1" })).toBe(false)
    expect(isRowValid({ label: "ok", price: "0,99", stock: "1" })).toBe(false)
    expect(isRowValid({ label: "ok", price: "abc", stock: "1" })).toBe(false)
    expect(isRowValid({ label: "ok", price: "10", stock: "-1" })).toBe(false)
    expect(isRowValid({ label: "ok", price: "10", stock: "" })).toBe(false)
    // tetos (mesmos do servidor)
    expect(isRowValid({ label: "ok", price: "100000,00", stock: "1" })).toBe(true)
    expect(isRowValid({ label: "ok", price: "100000,01", stock: "1" })).toBe(false)
    expect(isRowValid({ label: "ok", price: "10", stock: "100001" })).toBe(false)
    expect(isRowValid({ label: "x".repeat(81), price: "10", stock: "1" })).toBe(false)
    expect(failing({ ...good, rows: [] })).toEqual(["items"])
    expect(failing({ ...good, rows: [good.rows[0], { label: "", price: "", stock: "1" }] })).toEqual(["items"])
  })
})
