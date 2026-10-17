import { describe, expect, it } from "vitest"
import { anonymousName, publicNameRaw } from "@/lib/public-name"

describe("nome público de outras pessoas", () => {
  it("sem apelido vira 'Usuário' + 4 últimos caracteres do id, em maiúsculas", () => {
    expect(anonymousName("abc123xyz9")).toBe("Usuário XYZ9")
    expect(anonymousName("ab")).toBe("Usuário AB")
  })

  it("nunca recebe o nome legal: a função nem aceita esse argumento", () => {
    expect(anonymousName.length).toBe(1)
  })

  it("a versão em SQL cru usa a mesma regra (apelido sem espaços, senão o rótulo do id)", () => {
    const sql = publicNameRaw("u")
    expect(sql).toContain(`nullif(trim(u."displayName"), '')`)
    expect(sql).toContain(`'Usuário ' || upper(right(u."id", 4))`)
    expect(sql).not.toContain(`"name"`)
  })
})
