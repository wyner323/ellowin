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

  it("recusa TAB, quebra de linha e outros caracteres de controle (o navegador os remove e o destino vira outro site)", () => {
    const bad = [
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "/\t\\evil.com",
      "/\u0000/evil.com",
      "/ok\n",
      "/\u007f",
    ]
    for (const value of bad) expect(safeNext(value), JSON.stringify(value)).toBe("/conta")
  })

  it("só devolve caminhos que continuam no mesmo site depois de resolvidos", () => {
    for (const bad of ["/%2f/evil.com/..//evil.com", "/..//evil.com", "/.//evil.com"]) {
      const out = safeNext(bad)
      expect(new URL(out, "https://ellowin.com.br").origin, bad).toBe("https://ellowin.com.br")
    }
    // O valor aprovado volta como veio (a normalização poderia transformar "/..//x" em "//x").
    expect(safeNext("/a/../b?x=1#y")).toBe("/a/../b?x=1#y")
    expect(safeNext("/..//evil.com")).toBe("/..//evil.com")
  })
})
