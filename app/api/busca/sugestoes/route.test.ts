import { describe, expect, it } from "vitest"
import { GET } from "@/app/api/busca/sugestoes/route"

const get = (q?: string) => GET(new Request(`http://localhost/api/busca/sugestoes${q === undefined ? "" : `?q=${encodeURIComponent(q)}`}`))

describe("GET /api/busca/sugestoes", () => {
  it("devolve nomes de jogos para o termo, com Valorant na frente de 'val'", async () => {
    const res = await get("val")
    expect(res.status).toBe(200)
    const { suggestions } = await res.json()
    expect(suggestions[0]).toBe("Valorant")
    expect(suggestions.length).toBeLessThanOrEqual(8)
  })

  it("termo ausente, curto ou sem correspondência devolve lista vazia (nunca erro)", async () => {
    for (const q of [undefined, "", "a", "   ", "zzzzzz"]) {
      const res = await get(q)
      expect(res.status, String(q)).toBe(200)
      expect(await res.json()).toEqual({ suggestions: [] })
    }
  })

  it("só texto de catálogo: um termo malicioso não aparece na resposta", async () => {
    const res = await get("<script>alert(1)</script>")
    expect(JSON.stringify(await res.json())).not.toContain("script")
  })

  it("pode ficar em cache (só depende do texto digitado)", async () => {
    const res = await get("val")
    expect(res.headers.get("cache-control")).toContain("public")
    expect(res.headers.get("cache-control")).toContain("max-age")
  })
})
