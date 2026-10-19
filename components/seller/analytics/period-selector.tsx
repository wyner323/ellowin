import Link from "next/link"
import { ANALYTICS_PERIODS, type AnalyticsPeriod } from "@/lib/analytics-math"
import { cn } from "@/lib/utils"

/**
 * Seletor de período (7, 30 ou 90 dias) como links: o período vive na URL (`?periodo=`), então a página inteira é
 * recalculada no servidor, dá para compartilhar o link e funciona sem JavaScript.
 */
export function PeriodSelector({ basePath, active }: { basePath: string; active: AnalyticsPeriod }) {
  return (
    <nav aria-label="Período das análises" className="flex w-fit gap-1 rounded-lg border border-border bg-card p-0.5">
      {ANALYTICS_PERIODS.map((p) => (
        <Link
          key={p}
          href={`${basePath}?periodo=${p}`}
          aria-current={p === active ? "page" : undefined}
          scroll={false}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            p === active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p} dias
        </Link>
      ))}
    </nav>
  )
}
