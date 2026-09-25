import { describe, expect, it } from "vitest"
import { orderSteps } from "@/lib/order-steps"

const d = (day: number) => new Date(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`)
const base: { createdAt: Date; deliveredAt: Date | null; completedAt: Date | null } = {
  createdAt: d(1),
  deliveredAt: null,
  completedAt: null,
}
const states = (status: string, extra: Partial<typeof base> = {}) =>
  orderSteps({ status, ...base, ...extra }).map((s) => s.state)

describe("orderSteps", () => {
  it("sempre tem 3 etapas e a primeira é o pagamento", () => {
    for (const status of ["aguardando_entrega", "entregue", "concluido", "em_disputa", "reembolsado", "cancelado", "xyz"]) {
      const steps = orderSteps({ status, ...base })
      expect(steps).toHaveLength(3)
      expect(steps[0]).toMatchObject({ key: "paid", state: "done", date: base.createdAt })
    }
  })

  it("fluxo feliz: entrega atual, depois confirmação atual, depois tudo concluído", () => {
    expect(states("aguardando_entrega")).toEqual(["done", "current", "upcoming"])
    expect(states("entregue", { deliveredAt: d(2) })).toEqual(["done", "done", "current"])
    expect(states("concluido", { deliveredAt: d(2), completedAt: d(3) })).toEqual(["done", "done", "done"])
  })

  it("disputa e reembolso dependem de a entrega ter acontecido", () => {
    expect(states("em_disputa")).toEqual(["done", "stopped", "failed"])
    expect(states("em_disputa", { deliveredAt: d(2) })).toEqual(["done", "done", "failed"])
    expect(states("reembolsado")).toEqual(["done", "stopped", "stopped"])
    expect(states("reembolsado", { deliveredAt: d(2), completedAt: d(4) })).toEqual(["done", "done", "stopped"])
  })

  it("cancelado para na entrega e leva a data de encerramento", () => {
    const steps = orderSteps({ status: "cancelado", ...base, completedAt: d(5) })
    expect(steps.map((s) => s.label)).toEqual(["Pedido pago", "Entrega", "Cancelado"])
    expect(steps[2].date).toEqual(d(5))
  })
})
