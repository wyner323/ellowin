import { describe, expect, it } from "vitest"
import { parseSupportContact } from "@/lib/support"

describe("parseSupportContact", () => {
  it("sem configuração não há canal nem horário", () => {
    expect(parseSupportContact({})).toEqual({ email: null, hours: null })
  })

  it("aceita um e-mail válido e apara os espaços", () => {
    expect(parseSupportContact({ ELLOWIN_SUPPORT_EMAIL: "  ajuda@ellowin.com.br " }).email).toBe(
      "ajuda@ellowin.com.br",
    )
  })

  it("descarta e-mail inválido em vez de exibir lixo na tela", () => {
    for (const bad of ["ajuda", "ajuda@", "a b@c.com", "ajuda@ellowin", "javascript:alert(1)"]) {
      expect(parseSupportContact({ ELLOWIN_SUPPORT_EMAIL: bad }).email).toBeNull()
    }
  })

  it("limita o tamanho do horário", () => {
    const long = "x".repeat(500)
    expect(parseSupportContact({ ELLOWIN_SUPPORT_HOURS: long }).hours).toHaveLength(120)
    expect(parseSupportContact({ ELLOWIN_SUPPORT_HOURS: "   " }).hours).toBeNull()
  })
})
