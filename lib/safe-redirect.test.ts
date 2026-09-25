import { describe, expect, it } from "vitest"
import { safeNext } from "@/lib/safe-redirect"

describe("safeNext", () => {
  it("aceita caminhos internos, com query", () => {
    expect(safeNext("/produtos/x?a=1")).toBe("/produtos/x?a=1")
    expect(safeNext("/")).toBe("/")
    expect(safeNext(["/conta", "/outro"])).toBe("/conta")
  })

  it("recusa qualquer coisa que possa sair do site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "", undefined, "evil.com"])
      expect(safeNext(bad)).toBe("/conta")
    expect(safeNext("//evil.com", "/carteira")).toBe("/carteira")
  })
})
