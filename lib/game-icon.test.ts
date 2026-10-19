import { describe, expect, it } from "vitest"
import { GAMES } from "@/lib/product-catalog"
import { gameHue, gameIconBackground, gameInitials } from "@/lib/game-icon"

describe("gameInitials", () => {
  it("usa as iniciais das duas primeiras palavras que importam", () => {
    expect(gameInitials("League of Legends")).toBe("LL")
    expect(gameInitials("Counter Strike 2")).toBe("CS")
    expect(gameInitials("8 Ball Pool")).toBe("8B")
    expect(gameInitials("Albion Online")).toBe("AO")
    expect(gameInitials("Adventure Quest World")).toBe("AQ")
  })

  it("nome de uma palavra só usa as duas primeiras letras, sem acento", () => {
    expect(gameInitials("Valorant")).toBe("VA")
    expect(gameInitials("Ágora")).toBe("AG")
  })

  it("nunca devolve vazio nem passa de 2 caracteres, mesmo com nome estranho", () => {
    for (const odd of ["", "   ", "!!!", "of the", "A"]) {
      const out = gameInitials(odd)
      expect(out.length, JSON.stringify(odd)).toBeGreaterThanOrEqual(1)
      expect(out.length, JSON.stringify(odd)).toBeLessThanOrEqual(2)
    }
  })

  it("todos os jogos do catálogo têm iniciais válidas", () => {
    for (const g of GAMES) expect(gameInitials(g.name), g.name).toMatch(/^[\p{L}\p{N}]{1,2}$/u)
  })
})

describe("cor do ícone", () => {
  it("é estável: o mesmo slug dá sempre a mesma cor", () => {
    expect(gameHue("valorant")).toBe(gameHue("valorant"))
    expect(gameIconBackground("roblox")).toBe(gameIconBackground("roblox"))
    const hue = gameHue("valorant")
    expect(hue).toBeGreaterThanOrEqual(0)
    expect(hue).toBeLessThan(360)
  })

  it("espalha o catálogo por várias cores (não vira tudo da mesma cor)", () => {
    const hues = new Set(GAMES.map((g) => Math.floor(gameHue(g.slug) / 30)))
    expect(hues.size).toBeGreaterThanOrEqual(10)
  })
})
