import { describe, expect, it } from "vitest"
import { MAX_SUGGESTIONS, suggestGames } from "@/lib/search-suggest"

describe("suggestGames", () => {
  it("termo curto demais não sugere nada", () => {
    expect(suggestGames("")).toEqual([])
    expect(suggestGames("v")).toEqual([])
    expect(suggestGames("   ")).toEqual([])
  })

  it("acha por prefixo, sem depender de caixa", () => {
    expect(suggestGames("valo")).toContain("Valorant")
    expect(suggestGames("VALO")).toContain("Valorant")
  })

  it("ignora acento e pontuação", () => {
    expect(suggestGames("counter strike")).toContain("Counter Strike 2")
    expect(suggestGames("counter-strike")).toContain("Counter Strike 2")
  })

  it("casa o começo de qualquer palavra do nome", () => {
    expect(suggestGames("legends")).toContain("League of Legends")
  })

  it("nome que começa com o termo vem antes de nome com palavra que começa com ele", () => {
    expect(suggestGames("val")[0]).toBe("Valorant")
  })

  it("prefixo vem antes de quem só contém o termo", () => {
    const out = suggestGames("rob")
    expect(out[0]).toBe("Roblox")
  })

  it("respeita o limite e não repete", () => {
    const out = suggestGames("ga", 5)
    expect(out.length).toBeLessThanOrEqual(5)
    expect(new Set(out).size).toBe(out.length)
    expect(suggestGames("a").length).toBe(0)
    expect(suggestGames("an").length).toBeLessThanOrEqual(MAX_SUGGESTIONS)
  })

  it("termo sem correspondência devolve vazio e texto enorme não quebra", () => {
    expect(suggestGames("zzzzzz")).toEqual([])
    expect(() => suggestGames("x".repeat(10_000))).not.toThrow()
  })
})

describe("acentos", () => {
  it("termo com ou sem acento acha o mesmo jogo", () => {
    expect(suggestGames("pokémon")).toEqual(suggestGames("pokemon"))
  })
})
