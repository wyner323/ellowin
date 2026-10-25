import { describe, expect, it } from "vitest"
import {
  composeLowStockMessage, composeOrderMessages, composePriceDropMessage,
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

  it("entrega automática: um aviso só, que diz que já foi entregue, sem mandar o vendedor entregar e sem os dados por email", () => {
    const [seller, buyer] = composeOrderMessages("order_created", { ...ctx, automatic: true })
    expect(seller.intro).toContain("entrega já foi feita automaticamente")
    expect(seller.intro).toContain("92,00")
    expect(seller.buttonLabel).not.toMatch(/entregar/i)
    expect(seller.intro).not.toMatch(/entregue (até|o quanto antes)/i)
    expect(buyer.title).toBe("Seu pedido já foi entregue")
    expect(buyer.intro).toContain("não vão por email")
    expect(buyer.intro).toContain("100,00")
    expect(buyer.path).toBe("/pedidos/42")
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

describe("composePriceDropMessage", () => {
  const c = { productTitle: "Conta Valorant", productSlug: "conta-valorant", fromCents: 10_000, toCents: 8_000 }

  it("diz de quanto para quanto, leva ao anúncio e fala com o COMPRADOR", () => {
    const m = composePriceDropMessage(c)
    expect(m.recipient).toBe("buyer")
    expect(m.subject).toBe("Baixou o preço: Conta Valorant")
    expect(m.intro).toContain("100,00")
    expect(m.intro).toContain("80,00")
    expect(m.path).toBe("/produtos/conta-valorant")
  })

  it("não promete o que o site não cumpre", () => {
    expect(JSON.stringify(composePriceDropMessage(c))).not.toMatch(/garantia|24\/7|em minutos|verificado/i)
  })
})

describe("composeLowStockMessage", () => {
  const base = { productId: 7, productTitle: "Conta Valorant", variantLabel: "Imortal", stock: 2, automatic: false }

  it("estoque baixo: diz quantas unidades restam e leva à edição do anúncio", () => {
    const m = composeLowStockMessage(base)
    expect(m.recipient).toBe("seller")
    expect(m.subject).toBe("Estoque baixo: Imortal")
    expect(m.intro).toContain("2 unidades")
    expect(composeLowStockMessage({ ...base, stock: 1 }).intro).toContain("1 unidade ")
    expect(m.path).toBe("/painel/vendedor/produtos/7")
    expect(m.buttonLabel).toBe("Atualizar o estoque")
  })

  it("sem estoque: avisa que não pode mais ser comprado", () => {
    const m = composeLowStockMessage({ ...base, stock: 0 })
    expect(m.subject).toBe("Estoque esgotado: Imortal")
    expect(m.intro).toContain("não pode mais ser comprado")
  })

  it("entrega automática pede para cadastrar itens e leva à tela de estoque", () => {
    const m = composeLowStockMessage({ ...base, automatic: true, stock: 0 })
    expect(m.intro).toContain("Cadastre mais itens")
    expect(m.path).toBe("/painel/vendedor/produtos/7/estoque")
    expect(m.buttonLabel).toBe("Cadastrar itens")
  })

  it("não promete o que o site não cumpre", () => {
    for (const stock of [0, 1, 2]) expect(JSON.stringify(composeLowStockMessage({ ...base, stock }))).not.toMatch(/garantia|24\/7|em minutos|verificado/i)
  })
})
