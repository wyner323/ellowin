import { CheckCircle2, Flag, TrendingDown, TrendingUp } from "lucide-react"
import { GoalForm } from "@/components/seller/goal-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPercent, goalProgress } from "@/lib/analytics-math"
import { formatCents } from "@/lib/money"
import type { MonthProgressInputs } from "@/lib/seller-goals"
import { cn } from "@/lib/utils"

/** "2026-10" → "outubro de 2026" */
function monthName(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
}

/**
 * Meta de receita do mês: quanto já vendeu, quanto falta, o ritmo e a projeção para o fim do mês. O veredito é
 * sempre dito em palavras com ícone (nunca só cor). Sem meta definida, convida a criar uma.
 */
export function MonthlyGoalCard({ progress }: { progress: MonthProgressInputs }) {
  const goal = progress.goalCents
  const p = goal ? goalProgress({ revenueCents: progress.revenueCents, goalCents: goal, dayOfMonth: progress.dayOfMonth, daysInMonth: progress.daysInMonth }) : null
  const fill = p ? Math.min(100, Math.max(0, p.percent)) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Flag className="size-4 text-primary" aria-hidden="true" />
          Meta do mês
        </CardTitle>
        <span className="text-xs text-muted-foreground first-letter:uppercase">{monthName(progress.month)}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {goal && p ? (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span>
                  <strong className="font-display text-2xl font-bold tabular-nums">{formatCents(progress.revenueCents)}</strong>
                  <span className="ml-1.5 text-sm text-muted-foreground">de {formatCents(goal)}</span>
                </span>
                <strong className="font-display text-lg tabular-nums">{formatPercent(p.percent)}</strong>
              </div>
              <div
                className="h-2.5 w-full rounded-full bg-muted"
                role="progressbar"
                aria-label="Andamento da meta do mês"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(fill)}
              >
                <div className={cn("h-2.5 rounded-full", p.status === "alcancada" ? "bg-success" : "bg-[var(--color-chart-1)]")} style={{ width: `${fill}%` }} />
              </div>
            </div>

            <ul className="flex flex-col gap-1.5 text-sm">
              {p.status === "alcancada" ? (
                <li className="flex items-center gap-1.5 font-medium text-success">
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                  Meta alcançada! Tudo daqui para frente é a mais.
                </li>
              ) : (
                <li className="text-muted-foreground">
                  Faltam <strong className="text-foreground">{formatCents(p.remainingCents)}</strong>
                  {p.neededPerDayCents !== null ? (
                    <>
                      {" "}
                      — cerca de <strong className="text-foreground">{formatCents(p.neededPerDayCents)}</strong> por dia nos {p.daysLeft} dias que restam
                    </>
                  ) : (
                    " — hoje é o último dia do mês"
                  )}
                  .
                </li>
              )}
              {p.status === "no_ritmo" ? (
                <li className="flex items-center gap-1.5 text-success">
                  <TrendingUp className="size-4 shrink-0" aria-hidden="true" />
                  No ritmo atual você fecha o mês em {formatCents(p.projectedCents)}, acima da meta.
                </li>
              ) : null}
              {p.status === "abaixo" ? (
                <li className="flex items-center gap-1.5 text-destructive">
                  <TrendingDown className="size-4 shrink-0" aria-hidden="true" />
                  No ritmo atual você fecha o mês em {formatCents(p.projectedCents)}, abaixo da meta.
                </li>
              ) : null}
              {p.status === "inicio" ? <li className="text-xs text-muted-foreground">O mês começou agora: a projeção aparece a partir do 3º dia.</li> : null}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Defina quanto você quer receber (líquido, já descontada a taxa) neste mês e acompanhe o ritmo todo dia.
            {progress.revenueCents > 0 ? ` Você já vendeu ${formatCents(progress.revenueCents)} este mês.` : ""}
          </p>
        )}

        <GoalForm initialCents={goal} />
      </CardContent>
    </Card>
  )
}
