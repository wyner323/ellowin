import { describe, expect, it } from "vitest"
import {
  composeOrderMessages,
  composeQuestionMessage,
  type OrderContext,
  type OrderNotifyKind,
} from "@/lib/notification-messages"

const ctx: OrderContext = {
  orderId: 42,
  productTitle: "Conta Valorant Imortal",
  variantLabel: "40 skins",
  amountCents: 10000,
  sellerNetCents: 9200,
  buyerName: "Joaozinz",
  sellerName: "KeyPrime",
  deliveryDueAt: new Date("2026-09-26T15:30:00Z"),
}

const KINDS: OrderNotifyKind[] = [
  "order_created",
  "order_delivered",
  "order_completed",
  "order_auto_completed",
  "order_cancelled",
  "order_refunded_deadline",
  "dispute_opened",
  "dispute_resolved",
  "dispute_auto_refunded",
]

describe("composeOrderMessages", () => {
  it("todo email tem assunto, título, texto e um link interno", () => {
    for (const kind of KINDS)
      for (const m of composeOrderMessages(kind, { ...ctx, outcome: "comprador", cancelledBy: "comprador" })) {
        expect(m.subject.length).toBeGreaterThan(5)
        expect(m.title.length).toBeGreaterThan(5)
        expect(m.intro.length).toBeGreaterThan(20)
        expect(m.path).toMatch(/^\/[a-z]/)
        expect(["buyer", "seller"]).toContain(m.recipient)
      }
  })

  it("venda nova avisa o vendedor com o líquido e o prazo em horário de Brasília", () => {
    const [seller, buyer] = composeOrderMessages("order_created", ctx)
    expect(seller.recipient).toBe("seller")
    expect(seller.intro).toContain("Joaozinz")
    expect(seller.intro).toContain("92,00")
    expect(seller.intro).toContain("26/09 12:30")
    expect(buyer.recipient).toBe("buyer")
    expect(buyer.intro).toContain("100,00")
  })

  it("a entrega nunca manda os dados por email e leva ao pedido", () => {
    const [m] = composeOrderMessages("order_delivered", ctx)
    expect(m.recipient).toBe("buyer")
    expect(m.intro).toContain("não vão por email")
    expect(m.path).toBe("/pedidos/42")
  })

  it("decisão de disputa muda de texto conforme o resultado", () => {
    const [buyerWin, sellerLose] = composeOrderMessages("dispute_resolved", { ...ctx, outcome: "comprador" })
    expect(buyerWin.title).toContain("a seu favor")
    expect(buyerWin.intro).toContain("100,00")
    expect(sellerLose.title).toContain("a favor do comprador")

    const [buyerLose, sellerWin] = composeOrderMessages("dispute_resolved", { ...ctx, outcome: "vendedor" })
    expect(buyerLose.title).toContain("a favor do vendedor")
    expect(sellerWin.intro).toContain("92,00")
  })

  it("cancelamento diz quem cancelou", () => {
    const [buyer, seller] = composeOrderMessages("order_cancelled", { ...ctx, cancelledBy: "vendedor" })
    expect(buyer.intro).toContain("pelo vendedor")
    expect(seller.intro).toContain("por você")
  })

  it("pedido sem prazo (entrega automática) não inventa horário", () => {
    const [seller] = composeOrderMessages("order_created", { ...ctx, deliveryDueAt: null })
    expect(seller.intro).toContain("o quanto antes")
    expect(seller.intro).not.toMatch(/\d{2}\/\d{2} \d{2}:\d{2}/)
  })
})

describe("composeQuestionMessage", () => {
  const base = { productTitle: "Gift card", productSlug: "gift-card", askerName: "Ana", text: "Tem garantia?" }

  it("pergunta vai para o vendedor, resposta para quem perguntou", () => {
    expect(composeQuestionMessage("question_asked", base)).toMatchObject({ recipient: "seller", path: "/painel/vendedor/perguntas?filtro=pendentes" })
    expect(composeQuestionMessage("question_answered", base)).toMatchObject({ recipient: "buyer", path: "/produtos/gift-card" })
  })

  it("texto longo é cortado", () => {
    const m = composeQuestionMessage("question_asked", { ...base, text: "x".repeat(400) })
    expect(m.intro.length).toBeLessThan(500)
    expect(m.intro).toContain("…")
  })
})
