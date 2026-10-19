import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"
import { formatPercent, type Delta } from "@/lib/analytics-math"
import { cn } from "@/lib/utils"
import { Sparkline } from "@/components/seller/analytics/sparkline"

/**
 * Indicador do painel: rótulo, número grande, variação contra o período anterior e miniatura da curva.
 * A variação nunca depende só da cor: leva seta e sinal (ex.: "▲ +12%").
 * `goodWhen` diz para que lado "melhorar" aponta (cancelamentos subindo é ruim, receita subindo é bom).
 */
export function KpiCard({
  label,
  value,
  hint,
  delta,
  goodWhen = "up",
  deltaText,
  spark,
}: {
  label: string
  value: string
  /** linha de apoio embaixo do número (ex.: "12 vendas") */
  hint?: string
  delta?: Delta | null
  goodWhen?: "up" | "down"
  /** texto da variação já formatado (ex.: "+R$ 120,00"); sem ele usa o percentual */
  deltaText?: string
  spark?: number[]
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <strong className="font-display text-lg leading-none font-bold tracking-tight tabular-nums min-[420px]:text-xl md:text-2xl">{value}</strong>
      {spark ? <Sparkline values={spark} className="h-auto w-full" /> : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        {delta ? <DeltaBadge delta={delta} goodWhen={goodWhen} text={deltaText} /> : null}
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  )
}

export function DeltaBadge({ delta, goodWhen, text }: { delta: Delta; goodWhen: "up" | "down"; text?: string }) {
  const Icon = delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : ArrowRight
  const good = delta.direction === "flat" ? null : (delta.direction === "up") === (goodWhen === "up")
  const noBase = delta.pct === null && !text && delta.direction !== "flat"
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs font-medium",
        good === null ? "text-muted-foreground" : good ? "text-success" : "text-destructive",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {delta.direction === "flat" ? (
          <>igual ao <span className="max-sm:hidden">período </span>anterior</>
        ) : noBase ? (
          "sem base de comparação"
        ) : (
          <>
            {text ?? formatPercent(delta.pct, { sign: true })} vs. <span className="max-sm:hidden">período </span>anterior
          </>
        )}
      </span>
    </span>
  )
}
