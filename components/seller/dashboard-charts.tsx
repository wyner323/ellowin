"use client"

import { useState } from "react"
import Link from "next/link"
import { Minus, ShoppingBag, TrendingDown, TrendingUp } from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCents } from "@/lib/money"
import { cn } from "@/lib/utils"

/**
 * Selo de tendência ("+4 vs. período anterior") pro cabeçalho de um card de
 * gráfico. `formattedAbs` já vem pronto do server component (ex.:
 * `formatCents(Math.abs(delta))`) — funções não podem ser passadas de um
 * Server pra um Client Component, só o valor final.
 */
export function TrendBadge({
  delta,
  label,
  formattedAbs = String(Math.abs(delta)),
}: {
  delta: number
  label: string
  formattedAbs?: string
}) {
  if (delta === 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" aria-hidden="true" />
        Sem mudança {label}
      </span>
    )
  }

  const isUp = delta > 0
  const Icon = isUp ? TrendingUp : TrendingDown

  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs",
        isUp ? "text-success" : "text-destructive",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {isUp ? "+" : "-"}
      {formattedAbs} {label}
    </span>
  )
}

const axisTick = { fill: "var(--color-muted-foreground)", fontSize: 11 }
const axisLine = { stroke: "var(--border)" }
const tooltipStyle = {
  contentStyle: {
    backgroundColor: "var(--popover)",
    borderColor: "var(--border)",
    borderRadius: "var(--radius-md)",
    color: "var(--popover-foreground)",
    fontSize: 12,
  },
  labelStyle: { color: "var(--popover-foreground)" },
}

// Poucos ticks, sempre incluindo início/fim — evita rótulos amontoados
// quando o card fica estreito (celular, ou lado a lado no desktop).
const xAxisProps = {
  tick: axisTick,
  axisLine,
  tickLine: false,
  interval: "preserveStartEnd" as const,
  minTickGap: 24,
}

type BalancePoint = { date: string; balanceCents: number }
type BalanceChartPoint = { label: string; balanceCents: number }

function BalanceAreaChart({ data }: { data: BalanceChartPoint[] }) {
  return (
    <div className="h-48 w-full sm:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" {...xAxisProps} />
          <YAxis
            width={44}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => Math.round(v / 100).toLocaleString("pt-BR")}
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

const BALANCE_PERIODS = [7, 14, 30] as const
type BalancePeriod = (typeof BALANCE_PERIODS)[number]

/**
 * Card "Saldo ao longo do tempo" completo (título, seletor de período e o
 * gráfico) — dono do próprio estado, mesmo padrão de `SalesPerformanceCard`.
 * `data` vem do servidor com UM ponto por dia (saldo ao fim do dia, YYYY-MM-DD,
 * dias sem movimento repetem o saldo anterior) — antes era um ponto por
 * lançamento e o eixo repetia a mesma data várias vezes. O recorte por período
 * é pelos últimos N dias da série.
 */
export function BalanceHistoryCard({ data }: { data: BalancePoint[] }) {
  const [period, setPeriod] = useState<BalancePeriod>(30)

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saldo ao longo do tempo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Ainda sem movimentações na carteira.
          </p>
        </CardContent>
      </Card>
    )
  }

  // A série é diária e contínua até hoje: os últimos `period` pontos são os
  // últimos `period` dias (a conta pode ter menos, se for mais nova).
  const chartData = data.slice(-period).map((p) => {
    // Rótulo direto da string YYYY-MM-DD: `new Date("YYYY-MM-DD")` seria UTC
    // meia-noite e poderia mostrar o dia anterior no fuso local.
    const [, m, d] = p.date.split("-")
    return { label: `${d}/${m}`, balanceCents: p.balanceCents }
  })
  const delta =
    chartData.length >= 2
      ? chartData[chartData.length - 1].balanceCents - chartData[0].balanceCents
      : null

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Saldo ao longo do tempo</CardTitle>
          <div className="flex w-fit gap-1 rounded-lg border border-border p-0.5">
            {BALANCE_PERIODS.map((p) => (
              <Button
                key={p}
                type="button"
                size="xs"
                variant={period === p ? "secondary" : "ghost"}
                onClick={() => setPeriod(p)}
              >
                {p}d
              </Button>
            ))}
          </div>
        </div>
        {delta !== null ? (
          <TrendBadge delta={delta} label="no período" formattedAbs={formatCents(Math.abs(delta))} />
        ) : null}
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem movimentações nesse período.
          </p>
        ) : (
          <BalanceAreaChart data={chartData} />
        )}
      </CardContent>
    </Card>
  )
}

type SalesDay = { label: string; count: number; totalCents: number }
type SalesMetric = "count" | "revenue"

function SalesBarChart({ data, metric }: { data: SalesDay[]; metric: SalesMetric }) {
  const isRevenue = metric === "revenue"

  return (
    <div className="h-48 w-full sm:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" {...xAxisProps} />
          <YAxis
            width={isRevenue ? 44 : 28}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            tickFormatter={
              isRevenue ? (v: number) => Math.round(v / 100).toLocaleString("pt-BR") : undefined
            }
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(value) =>
              isRevenue ? [formatCents(Number(value)), "Receita"] : [Number(value), "Vendas"]
            }
          />
          <Bar
            dataKey={isRevenue ? "totalCents" : "count"}
            fill="var(--color-chart-2)"
            radius={4}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const SALES_PERIODS = [7, 14, 30] as const
type SalesPeriod = (typeof SALES_PERIODS)[number]

/**
 * Card "Vendas" completo (título, seletor de período, alternância de
 * métrica e o gráfico) — dono do próprio estado, por isso o card inteiro
 * vira client component em vez de só o gráfico.
 *
 * `data` vem do servidor já com os últimos 60 dias (o dobro do maior
 * período disponível), do mais antigo pro mais recente, pra sempre sobrar
 * um "período anterior" completo pra comparar contra o período selecionado.
 */
export function SalesPerformanceCard({
  data,
  hasAnySale,
  hasProducts,
  storeSlug,
}: {
  data: SalesDay[]
  hasAnySale: boolean
  hasProducts: boolean
  storeSlug: string | null
}) {
  const [period, setPeriod] = useState<SalesPeriod>(14)
  const [metric, setMetric] = useState<SalesMetric>("count")

  const currentSlice = data.slice(-period)
  const previousSlice = data.slice(-period * 2, -period)
  const sumBy = (days: SalesDay[], key: "count" | "totalCents") =>
    days.reduce((total, d) => total + d[key], 0)
  const delta =
    metric === "revenue"
      ? sumBy(currentSlice, "totalCents") - sumBy(previousSlice, "totalCents")
      : sumBy(currentSlice, "count") - sumBy(previousSlice, "count")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Vendas nos últimos {period} dias</CardTitle>
        {hasAnySale ? (
          <TrendBadge
            delta={delta}
            label="vs. período anterior"
            formattedAbs={metric === "revenue" ? formatCents(Math.abs(delta)) : undefined}
          />
        ) : null}
      </CardHeader>
      <CardContent>
        {!hasAnySale ? (
          <div className="flex flex-col items-start gap-3">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShoppingBag className="size-4 shrink-0" aria-hidden="true" />
              {hasProducts
                ? "Você ainda não vendeu nada."
                : "Você ainda não tem nenhum anúncio ativo."}
            </p>
            <Button
              size="sm"
              render={
                hasProducts ? (
                  <Link href={storeSlug ? `/loja/${storeSlug}` : "/painel/vendedor/produtos"} target={storeSlug ? "_blank" : undefined} />
                ) : (
                  <Link href="/painel/vendedor/produtos/novo" />
                )
              }
            >
              {hasProducts ? "Ver minha loja pública" : "Publicar meu primeiro anúncio"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex w-fit gap-1 rounded-lg border border-border p-0.5">
                {SALES_PERIODS.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="xs"
                    variant={period === p ? "secondary" : "ghost"}
                    onClick={() => setPeriod(p)}
                  >
                    {p}d
                  </Button>
                ))}
              </div>
              <div className="flex w-fit gap-1 rounded-lg border border-border p-0.5">
                <Button
                  type="button"
                  size="xs"
                  variant={metric === "count" ? "secondary" : "ghost"}
                  onClick={() => setMetric("count")}
                >
                  Nº de vendas
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={metric === "revenue" ? "secondary" : "ghost"}
                  onClick={() => setMetric("revenue")}
                >
                  Receita
                </Button>
              </div>
            </div>
            <SalesBarChart data={currentSlice} metric={metric} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

type ProductRevenue = { title: string; totalCents: number; count: number }

const RANK_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]

/**
 * Ranking dos anúncios que mais faturaram (só vendas concluídas). Vem do
 * servidor já ordenado e limitado a 5 — o componente só desenha.
 */
export function TopProductsChart({ data }: { data: ProductRevenue[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Assim que uma venda for concluída, o ranking por anúncio aparece aqui.
      </p>
    )
  }

  // Recharts desenha um BarChart vertical de cima pra baixo na ordem do
  // array — inverte pra o 1º colocado (maior faturamento) ficar no topo.
  const chartData = [...data].reverse()

  return (
    <div className="h-52 w-full sm:h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
          <CartesianGrid stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => Math.round(v / 100).toLocaleString("pt-BR")}
          />
          <YAxis
            type="category"
            dataKey="title"
            width={112}
            tick={{ ...axisTick, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(value) => [formatCents(Number(value)), "Faturamento"]}
          />
          <Bar dataKey="totalCents" radius={4} barSize={16}>
            {chartData.map((entry, index) => (
              <Cell key={entry.title} fill={RANK_COLORS[index % RANK_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
