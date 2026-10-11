import { describe, expect, it } from "vitest"
import { isUniqueViolation } from "@/lib/db-errors"

describe("isUniqueViolation", () => {
  it("reconhece o erro direto do driver (cliente cru)", () => {
    expect(isUniqueViolation(Object.assign(new Error("duplicate key"), { code: "23505" }))).toBe(true)
  })

  it("reconhece o erro embrulhado pelo Drizzle (código em .cause)", () => {
    const driver = Object.assign(new Error("duplicate key"), { code: "23505" })
    const wrapped = Object.assign(new Error("Failed query: update ..."), { cause: driver })
    expect(isUniqueViolation(wrapped)).toBe(true)
  })

  it("segue cadeias de causa mais longas, mas não infinitas", () => {
    const root = Object.assign(new Error("x"), { code: "23505" })
    const deep = [1, 2, 3].reduce<Error>((cause) => Object.assign(new Error("wrap"), { cause }), root)
    expect(isUniqueViolation(deep)).toBe(true)

    const cyclic: { cause?: unknown } = {}
    cyclic.cause = cyclic
    expect(isUniqueViolation(cyclic)).toBe(false)
  })

  it("outros códigos e valores quaisquer não contam", () => {
    expect(isUniqueViolation(Object.assign(new Error("fk"), { code: "23503" }))).toBe(false)
    expect(isUniqueViolation(Object.assign(new Error("wrap"), { cause: { code: "40001" } }))).toBe(false)
    for (const v of [null, undefined, "23505", 23505, {}, new Error("sem código")]) {
      expect(isUniqueViolation(v)).toBe(false)
    }
  })
})
