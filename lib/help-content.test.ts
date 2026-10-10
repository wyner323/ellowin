import { describe, expect, it } from "vitest"
import { HELP_TOPICS } from "@/lib/help-content"
import { AUTO_RELEASE_DAYS, PLATFORM_FEE_BPS } from "@/lib/money"

const questions = HELP_TOPICS.flatMap((t) => t.questions)
const allText = HELP_TOPICS.flatMap((t) => [t.title, t.summary, ...t.questions.flatMap((q) => [q.question, ...q.answer])]).join("\n")

describe("HELP_TOPICS", () => {
  it("ids de tópico e de pergunta são únicos (viram âncoras da página)", () => {
    const topicIds = HELP_TOPICS.map((t) => t.id)
    const questionIds = questions.map((q) => q.id)
    expect(new Set(topicIds).size).toBe(topicIds.length)
    expect(new Set(questionIds).size).toBe(questionIds.length)
    for (const id of [...topicIds, ...questionIds]) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it("todo tópico tem perguntas e toda pergunta tem resposta", () => {
    for (const t of HELP_TOPICS) expect(t.questions.length).toBeGreaterThan(0)
    for (const q of questions) {
      expect(q.question.trim().length).toBeGreaterThan(5)
      expect(q.answer.length).toBeGreaterThan(0)
      for (const p of q.answer) expect(p.trim().length).toBeGreaterThan(20)
    }
  })

  it("links internos começam com / e não há links vazios", () => {
    for (const q of questions)
      for (const l of q.links ?? []) {
        expect(l.label.trim()).not.toBe("")
        expect(l.href).toMatch(/^\/[a-z0-9\-/#]*$/)
      }
  })

  it("os números das respostas vêm das constantes reais do código", () => {
    expect(allText).toContain(`${AUTO_RELEASE_DAYS} dias após a compra`)
    expect(allText).toContain(`${PLATFORM_FEE_BPS / 100}% sobre o valor`)
  })

  it("não repete promessas que o sistema não cumpre", () => {
    for (const banned of [
      "verificado por CPF",
      "em minutos",
      "24/7",
      "menor taxa",
      "limite de venda",
      "reembolso imediato",
    ])
      expect(allText).not.toContain(banned)
  })
})
