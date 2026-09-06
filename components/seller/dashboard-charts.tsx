"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts"
import { formatCents } from "@/lib/money"

const axisTick = { fill: "var(--color-muted-foreground)", fontSize: 11 }
const axisLine = { stroke: "var(--border)" }
const tooltipStyle = {
  contentStyle: {
    backgroundColor: "var(--popover)",
    borderColor: "var(--border)",
    borderRadius: "var(--radius-md)",
    color: "var(--popover-foreground)",
  },
  labelStyle: { color: "var(--popover-foreground)" },
}

type BalancePoint = { label: string; balanceCents: number }

export function BalanceTrendChart({ data }: { data: BalancePoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ainda sem movimentações na carteira.
      </p>
    )
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={axisTick}
            axisLine={axisLine}
            tickLine={false}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(value) => [formatCents(Number(value)), "Saldo"]}
          />
          <Area
            type="monotone"
            dataKey="balanceCents"
            stroke="var(--color-chart-1)"
            fill="url(#balanceFill)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

type SalesPoint = { label: string; count: number }

export function SalesPerDayChart({
  data,
  hasAnySale,
}: {
  data: SalesPoint[]
  hasAnySale: boolean
}) {
  if (!hasAnySale) {
    return <p className="text-sm text-muted-foreground">Você ainda não vendeu nada.</p>
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={axisTick}
            axisLine={axisLine}
            tickLine={false}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(value) => [Number(value), "Vendas"]}
          />
          <Bar dataKey="count" fill="var(--color-chart-2)" radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
