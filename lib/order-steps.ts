/**
 * Linha do tempo de um pedido: 3 etapas fixas (pago → entrega → conclusão) cujo
 * estado e rótulo dependem do status atual. Puro, para poder ser testado.
 */

export type StepState = "done" | "current" | "upcoming" | "failed" | "stopped"

export type OrderStep = {
  key: "paid" | "delivery" | "final"
  label: string
  state: StepState
  date: Date | null
}

type Input = {
  status: string
  createdAt: Date
  deliveredAt: Date | null
  completedAt: Date | null
}

export function orderSteps({ status, createdAt, deliveredAt, completedAt }: Input): OrderStep[] {
  const paid: OrderStep = { key: "paid", label: "Pedido pago", state: "done", date: createdAt }

  switch (status) {
    case "aguardando_entrega":
      return [
        paid,
        { key: "delivery", label: "Entrega", state: "current", date: null },
        { key: "final", label: "Confirmação", state: "upcoming", date: null },
      ]

    case "entregue":
      return [
        paid,
        { key: "delivery", label: "Entregue", state: "done", date: deliveredAt },
        { key: "final", label: "Confirmação", state: "current", date: null },
      ]

    case "concluido":
      return [
        paid,
        { key: "delivery", label: "Entregue", state: "done", date: deliveredAt },
        { key: "final", label: "Concluído", state: "done", date: completedAt },
      ]

    case "em_disputa":
      return [
        paid,
        deliveredAt
          ? { key: "delivery", label: "Entregue", state: "done", date: deliveredAt }
          : { key: "delivery", label: "Entrega", state: "stopped", date: null },
        { key: "final", label: "Em disputa", state: "failed", date: null },
      ]

    case "reembolsado":
      return [
        paid,
        deliveredAt
          ? { key: "delivery", label: "Entregue", state: "done", date: deliveredAt }
          : { key: "delivery", label: "Entrega", state: "stopped", date: null },
        { key: "final", label: "Reembolsado", state: "stopped", date: completedAt },
      ]

    case "cancelado":
      return [
        paid,
        { key: "delivery", label: "Entrega", state: "stopped", date: null },
        { key: "final", label: "Cancelado", state: "stopped", date: completedAt },
      ]

    default:
      return [
        paid,
        { key: "delivery", label: "Entrega", state: "upcoming", date: null },
        { key: "final", label: "Conclusão", state: "upcoming", date: null },
      ]
  }
}
