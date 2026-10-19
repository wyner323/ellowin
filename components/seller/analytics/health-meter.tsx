import { AlertTriangle, CheckCircle2, MinusCircle } from "lucide-react"
import { formatPercent } from "@/lib/analytics-math"
import { cn } from "@/lib/utils"

/**
 * Um indicador de saúde da operação com meta: nome, valor, barra e um veredito em TEXTO com ícone (nunca só cor).
 * `goodWhen: "high"` = quanto maior melhor (entregas no prazo); `"low"` = quanto menor melhor (cancelamentos).
 * `value`/`target` e `previous` em porcentagem (0–100). Sem dado ainda, mostra "sem dados" em vez de inventar um número.
 */
export function HealthMeter({
  label,
  value,
  target,
  previous,
  goodWhen,
  detail,
}: {
  label: string
  value: number | null
  target: number
  previous?: number | null
  goodWhen: "high" | "low"
  detail?: string
}) {
  const ok = value === null ? null : goodWhen === "high" ? value >= target : value <= target
  const Icon = ok === null ? MinusCircle : ok ? CheckCircle2 : AlertTriangle
  const verdict =
    ok === null
      ? "Sem dados no período"
      : goodWhen === "high"
        ? ok
          ? `Dentro da meta (${target}% ou mais)`
          : `Abaixo da meta de ${target}%`
        : ok
          ? `Dentro da meta (até ${target}%)`
          : `Acima da meta de ${target}%`
  const fill = value === null ? 0 : Math.min(100, Math.max(0, value))
  const change = value !== null && previous !== null && previous !== undefined ? value - previous : null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <strong className="font-display text-lg tabular-nums">{value === null ? "—" : formatPercent(value)}</strong>
      </div>
      <div className="relative h-2 w-full rounded-full bg-muted" role="presentation">
        <div className={cn("h-2 rounded-full", ok === false ? "bg-destructive" : "bg-[var(--color-chart-1)]")} style={{ width: `${fill}%` }} />
        <span className="absolute top-[-3px] h-3.5 w-0.5 rounded bg-foreground/60" style={{ left: `${Math.min(100, target)}%` }} aria-hidden="true" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
        <span className={cn("flex items-center gap-1", ok === false ? "text-destructive" : ok ? "text-success" : "text-muted-foreground")}>
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          {verdict}
        </span>
        {change !== null && change !== 0 ? (
          <span className="text-muted-foreground">
            {change > 0 ? "+" : "−"}
            {formatPercent(Math.abs(change), { digits: 0 })} pts vs. período anterior
          </span>
        ) : null}
      </div>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  )
}
