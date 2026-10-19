import { formatPercent } from "@/lib/analytics-math"
import { formatValue, type ValueKind } from "@/components/seller/analytics/format"

export type BarRow = { label: string; value: number; hint?: string }

/**
 * Ranking em barras horizontais (HTML puro, renderiza no servidor): rótulo à esquerda, barra de até 24px de espessura
 * com a ponta arredondada, valor na ponta e, abaixo do nome, a parcela do total. Uma cor só (a do painel): a
 * posição na lista já conta a ordem. O número aparece em texto, então o gráfico nunca depende só da cor.
 */
export function BarList({
  rows,
  kind,
  emptyText,
  showShare = true,
}: {
  rows: BarRow[]
  kind: ValueKind
  emptyText: string
  showShare?: boolean
}) {
  const total = rows.reduce((s, r) => s + r.value, 0)
  const max = Math.max(0, ...rows.map((r) => r.value))
  if (rows.length === 0 || max === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const pct = (row.value / max) * 100
        return (
          <li key={row.label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium" title={row.label}>
                {row.label}
              </span>
              <span className="shrink-0 font-display font-bold tabular-nums">{formatValue(row.value, kind)}</span>
            </div>
            <div className="h-2 w-full rounded-r-full bg-muted" role="presentation">
              <div className="h-2 rounded-r-full bg-[var(--color-chart-1)]" style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
            {showShare || row.hint ? (
              <span className="text-xs text-muted-foreground">
                {[showShare && total > 0 ? `${formatPercent((row.value / total) * 100)} do total` : null, row.hint].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
