import { cn } from "@/lib/utils"
import { TONE, type StatusTone } from "@/components/orders/order-status-badge"
import type { LucideIcon } from "lucide-react"

export type StatTileData = {
  icon: LucideIcon
  label: string
  value: string
  /** Realça o tile (ex.: gold quando há entregas pendentes). Sem tom = neutro. */
  tone?: StatusTone
}

/** Faixa de números-resumo no topo das telas de lista (mesma linguagem do painel). */
export function StatTiles({ tiles }: { tiles: StatTileData[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {tiles.map(({ icon: Icon, label, value, tone }) => (
        <div
          key={label}
          className={cn(
            "flex items-center gap-3 rounded-2xl border bg-card p-4",
            tone && tone !== "muted" ? TONE[tone].border : "border-border",
          )}
        >
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl",
              TONE[tone ?? "muted"].tile,
            )}
            aria-hidden="true"
          >
            <Icon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col">
            <strong className="font-display text-xl leading-tight font-bold tabular-nums">
              {value}
            </strong>
            <span className="truncate text-xs text-muted-foreground">{label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
