import { describe, expect, it } from "vitest"
import { orderHint } from "@/lib/order-hints"

const now = new Date("2026-09-25T15:00:00Z")
const inHours = (h: number) => new Date(now.getTime() + h * 3600_000)

describe("orderHint", () => {
  it("vendedor aguardando entrega: prazo futuro, vencido e sem prazo", () => {
    const soon = orderHint({ status: "aguardando_entrega", role: "vendedor", deliveryDueAt: inHours(2), autoReleaseAt: null, now })
    expect(soon?.urgent).toBe(false)
    expect(soon?.text).toMatch(/^Entregar até \d{2}\/\d{2} \d{2}:\d{2}$/)

    expect(orderHint({ status: "aguardando_entrega", role: "vendedor", deliveryDueAt: inHours(-1), autoReleaseAt: null, now })).toEqual({
      text: "Prazo de entrega vencido — entregue agora",
      urgent: true,
    })

    expect(orderHint({ status: "aguardando_entrega", role: "vendedor", deliveryDueAt: null, autoReleaseAt: null, now })?.text).toBe("Aguardando você entregar")
  })

  it("mostra o horário de Brasília, não o UTC", () => {
    const hint = orderHint({ status: "aguardando_entrega", role: "vendedor", deliveryDueAt: new Date("2026-09-25T15:30:00Z"), autoReleaseAt: null, now })
    expect(hint?.text).toBe("Entregar até 25/09 12:30")
  })

  it("comprador entregue: contagem regressiva da liberação automática", () => {
    expect(orderHint({ status: "entregue", role: "comprador", deliveryDueAt: null, autoReleaseAt: inHours(72), now })).toEqual({
      text: "Confirme o recebimento · libera automaticamente em 3 dias",
      urgent: false,
    })
    expect(orderHint({ status: "entregue", role: "comprador", deliveryDueAt: null, autoReleaseAt: inHours(20), now })).toEqual({
      text: "Confirme o recebimento · libera automaticamente em 1 dia",
      urgent: true,
    })
    expect(orderHint({ status: "entregue", role: "comprador", deliveryDueAt: null, autoReleaseAt: inHours(-1), now })?.text).toBe(
      "Confirme o recebimento · libera automaticamente hoje",
    )
  })

  it("vendedor entregue espera o comprador; disputa é urgente; concluídos não têm dica", () => {
    expect(orderHint({ status: "entregue", role: "vendedor", deliveryDueAt: null, autoReleaseAt: null, now })?.text).toBe("Aguardando o comprador confirmar")
    expect(orderHint({ status: "em_disputa", role: "comprador", deliveryDueAt: null, autoReleaseAt: null, now })?.urgent).toBe(true)
    for (const status of ["concluido", "reembolsado", "cancelado"])
      expect(orderHint({ status, role: "vendedor", deliveryDueAt: null, autoReleaseAt: null, now })).toBeNull()
  })
})
