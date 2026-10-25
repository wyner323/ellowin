import { describe, expect, it } from "vitest"
import { CHAT_REPLIES, DELIVERY_TEMPLATES, REVIEW_REPLIES, appendReply } from "@/lib/canned-replies"
import { MAX_REPLY, MIN_REPLY } from "@/lib/review-reply-rules"

const ALL = [...DELIVERY_TEMPLATES, ...CHAT_REPLIES, ...REVIEW_REPLIES]

describe("respostas prontas", () => {
  it("cada grupo tem ids únicos e rótulos curtos", () => {
    for (const group of [DELIVERY_TEMPLATES, CHAT_REPLIES, REVIEW_REPLIES]) {
      expect(new Set(group.map((r) => r.id)).size).toBe(group.length)
      for (const r of group) {
        expect(r.label.length).toBeGreaterThan(2)
        expect(r.label.length).toBeLessThanOrEqual(24)
      }
    }
  })

  it("cabem nos limites de cada destino: avaliação (500), chat (2000) e entrega (5000)", () => {
    for (const r of REVIEW_REPLIES) {
      expect(r.text.length).toBeGreaterThanOrEqual(MIN_REPLY)
      expect(r.text.length).toBeLessThanOrEqual(MAX_REPLY)
    }
    for (const r of CHAT_REPLIES) expect(r.text.length).toBeLessThanOrEqual(2000)
    for (const r of DELIVERY_TEMPLATES) expect(r.text.length).toBeLessThanOrEqual(5000)
  })

  it("não prometem o que a plataforma não cumpre (mesmas frases barradas no resto do site)", () => {
    for (const r of ALL) expect(r.text.toLowerCase()).not.toMatch(/garantia|garantido|24\/7|em minutos|verificado/)
  })

  it("modelos de entrega ficam em branco depois dos dois pontos (o vendedor preenche) e nunca trazem dado de exemplo", () => {
    for (const r of DELIVERY_TEMPLATES) expect(r.text).not.toMatch(/\d{4,}/)
  })
})

describe("appendReply", () => {
  it("caixa vazia ou só espaços: entra o modelo puro", () => {
    expect(appendReply("", "Modelo")).toBe("Modelo")
    expect(appendReply("  \n ", "Modelo")).toBe("Modelo")
  })

  it("caixa com texto: o modelo vai depois, separado por uma linha em branco, sem apagar nada", () => {
    expect(appendReply("Olá!", "Modelo")).toBe("Olá!\n\nModelo")
    expect(appendReply("Olá!  \n\n", "Modelo")).toBe("Olá!\n\nModelo")
  })
})
