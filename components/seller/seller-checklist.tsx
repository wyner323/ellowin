import Link from "next/link"
import { CheckCircle2, Circle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Checklist, ChecklistItem } from "@/lib/seller-checklist"
import { cn } from "@/lib/utils"

function Row({ item }: { item: ChecklistItem }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {item.done ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <div className="flex min-w-0 flex-col">
        {item.done ? (
          <span className="text-muted-foreground line-through decoration-muted-foreground/50">
            {item.label}
            <span className="sr-only"> (feito)</span>
          </span>
        ) : (
          <Link href={item.href} className="font-medium hover:text-primary hover:underline">
            {item.label}
            <span className="sr-only"> (pendente)</span>
          </Link>
        )}
        {item.detail ? <span className="text-xs text-muted-foreground">{item.detail}</span> : null}
      </div>
    </li>
  )
}

/**
 * "Complete a sua loja": só aparece para vendedor novo com algo por fazer. O progresso vem em número e em barra com
 * rótulo; cada item pendente é um link para a tela certa, e o feito fica riscado com texto de leitor de tela.
 */
export function SellerChecklist({ checklist }: { checklist: Checklist }) {
  if (!checklist.show) return null
  const percent = Math.round((checklist.doneCount / checklist.totalCount) * 100)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Complete a sua loja</CardTitle>
        <span className="text-xs text-muted-foreground tabular-nums">
          {checklist.doneCount} de {checklist.totalCount} passos
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          className="h-2 w-full rounded-full bg-muted"
          role="progressbar"
          aria-label="Passos da loja concluídos"
          aria-valuemin={0}
          aria-valuemax={checklist.totalCount}
          aria-valuenow={checklist.doneCount}
        >
          <div className={cn("h-2 rounded-full bg-[var(--color-chart-1)]")} style={{ width: `${percent}%` }} />
        </div>

        <ul className="flex flex-col gap-2.5">
          {checklist.steps.map((item) => (
            <Row key={item.key} item={item} />
          ))}
        </ul>

        {checklist.pending.length > 0 ? (
          <div className="flex flex-col gap-2.5 border-t border-border pt-4">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Para responder</h3>
            <ul className="flex flex-col gap-2.5">
              {checklist.pending.map((item) => (
                <Row key={item.key} item={item} />
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
