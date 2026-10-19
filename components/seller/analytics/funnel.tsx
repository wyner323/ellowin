import { formatPercent, ratio } from "@/lib/analytics-math"

export type FunnelStage = { label: string; value: number }

/**
 * Funil de conversão em barras empilhadas na vertical (visitas → pedidos → vendas concluídas). Cada barra é
 * proporcional à primeira etapa; entre duas etapas aparece a taxa de passagem em texto. Sem visitas registradas, o
 * funil começa nos pedidos.
 */
export function Funnel({ stages, emptyText }: { stages: FunnelStage[]; emptyText: string }) {
  const first = stages[0]?.value ?? 0
  if (stages.length === 0 || first === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>

  return (
    <ol className="flex flex-col gap-2">
      {stages.map((stage, i) => {
        const pct = (stage.value / first) * 100
        const step = i > 0 ? ratio(stage.value, stages[i - 1].value) : null
        return (
          <li key={stage.label} className="flex flex-col gap-1">
            {i > 0 ? (
              <span className="pl-1 text-xs text-muted-foreground">
                ↓ {step === null ? "—" : formatPercent(step * 100)} avançam para a próxima etapa
              </span>
            ) : null}
            <div className="flex items-center gap-3">
              <div className="h-7 min-w-0 flex-1 rounded-md bg-muted" role="presentation">
                <div className="h-7 rounded-md bg-[var(--color-chart-1)]" style={{ width: `${Math.max(1.5, pct)}%`, opacity: 1 - i * 0.18 }} />
              </div>
              <div className="flex w-28 shrink-0 flex-col leading-tight">
                <strong className="font-display text-base tabular-nums">{stage.value.toLocaleString("pt-BR")}</strong>
                <span className="text-xs text-muted-foreground">{stage.label}</span>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
