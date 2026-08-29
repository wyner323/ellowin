/**
 * Prazo de entrega — um conjunto fixo de janelas, em vez de texto livre.
 *
 * Isso é o que permite, mais pra frente, detectar automaticamente quando um
 * vendedor não entregou dentro do prazo prometido no anúncio (hoje isso já
 * existe pro prazo de resposta em disputas, em `lib/sla.ts`; o mesmo padrão
 * dá pra aplicar aqui usando `hours`).
 *
 * Entrega automática é sempre instantânea — não faz sentido pedir uma janela
 * pra ela, então usa sempre `INSTANT_DELIVERY_TIME`.
 */

export const INSTANT_DELIVERY_TIME = "Imediata (entrega automática)"

export type DeliveryTimeOption = {
  /** Também é o valor salvo em `product.deliveryTime`. */
  label: string
  hours: number
}

export const DELIVERY_TIME_OPTIONS: DeliveryTimeOption[] = [
  { label: "Até 30 minutos", hours: 0.5 },
  { label: "Até 1 hora", hours: 1 },
  { label: "Até 6 horas", hours: 6 },
  { label: "Até 12 horas", hours: 12 },
  { label: "Até 24 horas", hours: 24 },
  { label: "Até 48 horas", hours: 48 },
  { label: "Até 72 horas", hours: 72 },
]

export const DEFAULT_MANUAL_DELIVERY_TIME = "Até 24 horas"

export function hoursForDeliveryTime(label: string): number | null {
  return DELIVERY_TIME_OPTIONS.find((o) => o.label === label)?.hours ?? null
}
