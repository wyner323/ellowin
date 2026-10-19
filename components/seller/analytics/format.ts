import { formatPercent } from "@/lib/analytics-math"
import { formatCents } from "@/lib/money"
import { formatDurationHours } from "@/lib/time"

/** Tipo de número de um gráfico/indicador. Passa-se o TIPO (texto) do servidor para o cliente, nunca uma função. */
export type ValueKind = "money" | "count" | "ratio" | "hours"

export function formatValue(value: number | null, kind: ValueKind): string {
  if (value === null || !Number.isFinite(value)) return "—"
  switch (kind) {
    case "money":
      return formatCents(Math.round(value))
    case "count":
      return Math.round(value).toLocaleString("pt-BR")
    case "ratio":
      return formatPercent(value * 100)
    case "hours":
      return formatDurationHours(value)
  }
}
