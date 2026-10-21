import { describe, expect, it } from "vitest"
import { listingQuality, QUALITY_POINTS, type QualityInput } from "@/lib/listing-quality"

const full: QualityInput = {
  title: "Conta Roblox com 40 itens raros",
  description: "x".repeat(300),
  game: "Roblox",
  categorySlug: "contas",
  attributes: {},
  imageCount: 3,
}

describe("listingQuality", () => {
  it("anúncio completo fecha 100 e não tem o que melhorar", () => {
    const q = listingQuality(full)
    expect(q.score).toBe(100)
    expect(q.level).toBe("completo")
    expect(q.tips).toEqual([])
  })

  it("os pesos somam 100", () => {
    expect(Object.values(QUALITY_POINTS).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it("fotos: 0, 1, 2 e 3+ valem 0, 15, 22 e 30", () => {
    expect(listingQuality({ ...full, imageCount: 0 }).score).toBe(70)
    expect(listingQuality({ ...full, imageCount: 1 }).score).toBe(85)
    expect(listingQuality({ ...full, imageCount: 2 }).score).toBe(92)
    expect(listingQuality({ ...full, imageCount: 9 }).score).toBe(100)
  })

  it("descrição: fronteiras de 20, 120 e 300 caracteres (espaços nas pontas não contam)", () => {
    const at = (n: number) => listingQuality({ ...full, description: ` ${"x".repeat(n)} ` }).score
    expect(at(19)).toBe(70)
    expect(at(20)).toBe(80)
    expect(at(119)).toBe(80)
    expect(at(120)).toBe(90)
    expect(at(299)).toBe(90)
    expect(at(300)).toBe(100)
  })

  it("título: fronteiras de 8 e 20 caracteres", () => {
    const at = (n: number) => listingQuality({ ...full, title: "t".repeat(n) }).score
    expect(at(7)).toBe(80)
    expect(at(8)).toBe(90)
    expect(at(19)).toBe(90)
    expect(at(20)).toBe(100)
  })

  it("jogo em branco perde 10 pontos e vira dica", () => {
    const q = listingQuality({ ...full, game: "  " })
    expect(q.score).toBe(90)
    expect(q.tips.map((t) => t.key)).toEqual(["game"])
  })

  it("jogo com campos próprios (Valorant): o que falta pesa proporcionalmente e a dica nomeia o campo", () => {
    const base = { ...full, game: "Valorant", categorySlug: "contas" }
    const none = listingQuality({ ...base, attributes: {} })
    expect(none.score).toBeLessThan(100)
    const tip = none.tips.find((t) => t.key === "attributes")
    expect(tip?.points).toBe(QUALITY_POINTS.attributes)
    expect(tip?.text.toLowerCase()).toContain("informe")
  })

  it("jogo sem campos próprios não perde pontos por atributos", () => {
    expect(listingQuality({ ...full, game: "Roblox", attributes: {} }).tips.some((t) => t.key === "attributes")).toBe(false)
  })

  it("níveis: completo a partir de 80, bom a partir de 50", () => {
    expect(listingQuality({ ...full, imageCount: 1 }).level).toBe("completo") // 85
    expect(listingQuality({ ...full, imageCount: 0, description: "x".repeat(20) }).level).toBe("bom") // 50
    expect(listingQuality({ ...full, imageCount: 0, description: "x".repeat(20), game: null }).level).toBe("incompleto") // 40
  })

  it("dicas vêm das que mais pesam para as que menos pesam", () => {
    const q = listingQuality({ title: "curto", description: "", game: null, categorySlug: "contas", attributes: {}, imageCount: 0 })
    expect(q.score).toBe(10) // só os 10 pontos de "jogo sem campos próprios"
    const points = q.tips.map((t) => t.points)
    expect(points).toEqual([...points].sort((a, b) => b - a))
    expect(q.tips[0].points).toBe(30)
  })
})
