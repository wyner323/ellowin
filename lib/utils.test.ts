import { describe, expect, it } from "vitest"
import { ACCENT_COLORS, accentColorHex, isValidAccentColor } from "@/lib/accent-colors"
import { cn, initialsOf, publicName } from "@/lib/utils"

describe("publicName", () => {
  it("apelido primeiro (sem espaços nas pontas); nome legal só se não houver apelido útil", () => {
    expect(publicName("Ana Maria da Silva", "AnaGames")).toBe("AnaGames")
    expect(publicName("Ana Maria da Silva", "  AnaGames  ")).toBe("AnaGames")
    expect(publicName("Ana Maria da Silva", null)).toBe("Ana Maria da Silva")
    expect(publicName("Ana Maria da Silva", undefined)).toBe("Ana Maria da Silva")
    expect(publicName("Ana Maria da Silva", "")).toBe("Ana Maria da Silva")
    expect(publicName("Ana Maria da Silva", "   ")).toBe("Ana Maria da Silva")
  })
})

describe("initialsOf", () => {
  it("até duas iniciais maiúsculas; vazio vira E", () => {
    expect(initialsOf("Ana Maria Silva")).toBe("AM")
    expect(initialsOf("ana")).toBe("A")
    expect(initialsOf("  carlos   lima ")).toBe("CL")
    expect(initialsOf("")).toBe("E")
    expect(initialsOf("   ")).toBe("E")
  })
})

describe("cn", () => {
  it("junta classes, ignora falsos e resolve conflito do Tailwind (a última vence)", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c")
    expect(cn("px-2", "px-4")).toBe("px-4")
    expect(cn("text-sm", { hidden: true, flex: false })).toBe("text-sm hidden")
  })
})

describe("cores de destaque", () => {
  it("só aceita as cores do conjunto fechado, nunca nomes herdados do Object", () => {
    for (const id of Object.keys(ACCENT_COLORS)) expect(isValidAccentColor(id)).toBe(true)
    for (const bad of ["constructor", "__proto__", "toString", "hasOwnProperty", "vermelho", "", "AZUL"]) {
      expect(isValidAccentColor(bad)).toBe(false)
    }
  })

  it("hex da cor; padrão e inválidas devolvem nulo (usa a cor da marca)", () => {
    expect(accentColorHex("azul")).toBe("#3B82F6")
    expect(accentColorHex("rosa")).toBe("#EC4899")
    expect(accentColorHex("padrao")).toBeNull()
    expect(accentColorHex("constructor")).toBeNull()
    expect(accentColorHex("nada")).toBeNull()
    expect(accentColorHex(null)).toBeNull()
    expect(accentColorHex(undefined)).toBeNull()
  })
})
