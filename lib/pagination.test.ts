import { describe, expect, it } from "vitest"
import { escapeLike, parsePage, resolvePage, totalPages } from "@/lib/pagination"

describe("parsePage", () => {
  it("aceita inteiros positivos", () => {
    expect(parsePage("1")).toBe(1)
    expect(parsePage("7")).toBe(7)
    expect(parsePage(["3", "9"])).toBe(3)
  })

  it("qualquer valor estranho vira a página 1", () => {
    for (const bad of [undefined, "", "0", "-2", "abc", "1.5", "2e3", " 4", "9999999", "1; drop"])
      expect(parsePage(bad)).toBe(1)
  })
})

describe("totalPages / resolvePage", () => {
  it("lista vazia ainda tem 1 página", () => {
    expect(totalPages(0)).toBe(1)
    expect(resolvePage(1, 0)).toMatchObject({ page: 1, pages: 1, offset: 0 })
  })

  it("arredonda para cima nas fronteiras", () => {
    expect(totalPages(20)).toBe(1)
    expect(totalPages(21)).toBe(2)
    expect(totalPages(40)).toBe(2)
    expect(totalPages(41)).toBe(3)
  })

  it("página além do fim cai na última; offset acompanha", () => {
    expect(resolvePage(99, 45)).toEqual({ page: 3, pages: 3, offset: 40, limit: 20 })
    expect(resolvePage(2, 45)).toEqual({ page: 2, pages: 3, offset: 20, limit: 20 })
  })
})

describe("escapeLike", () => {
  it("neutraliza curingas do ILIKE", () => {
    expect(escapeLike("100%_ok\\")).toBe("100\\%\\_ok\\\\")
    expect(escapeLike("conta cs2")).toBe("conta cs2")
  })
})
