import { Check, Minus, X } from "lucide-react"
import { orderSteps, type StepState } from "@/lib/order-steps"
import { cn } from "@/lib/utils"

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
})

const DOT: Record<StepState, string> = {
  done: "bg-success text-success-foreground",
  current: "bg-primary text-primary-foreground ring-4 ring-primary/25",
  upcoming: "border border-border bg-muted text-muted-foreground",
  failed: "bg-destructive text-white ring-4 ring-destructive/20",
  stopped: "bg-muted text-muted-foreground",
}

/**
 * Onde o pedido está: pago → entrega → conclusão. Cor e ícone contam o estado
 * (feito, em andamento, parado, disputa) sem depender só do rótulo.
 */
export function OrderTimeline({
  status,
  createdAt,
  deliveredAt,
  completedAt,
}: {
  status: string
  createdAt: Date
  deliveredAt: Date | null
  completedAt: Date | null
}) {
  const steps = orderSteps({ status, createdAt, deliveredAt, completedAt })

  return (
    <ol className="grid grid-cols-3" aria-label="Andamento do pedido">
      {steps.map((step, index) => (
        <li key={step.key} className="relative flex flex-col items-center gap-2 text-center">
          {index > 0 ? (
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2",
                step.state === "upcoming" || step.state === "stopped" ? "bg-border" : "bg-success",
                step.state === "failed" && "bg-destructive/60",
              )}
            />
          ) : null}
          <span
            className={cn(
              "relative z-10 flex size-7 items-center justify-center rounded-full",
              DOT[step.state],
            )}
            aria-hidden="true"
          >
            {step.state === "done" ? (
              <Check className="size-4" />
            ) : step.state === "failed" ? (
              <X className="size-4" />
            ) : step.state === "stopped" ? (
              <Minus className="size-4" />
            ) : (
              <span className="size-2 rounded-full bg-current" />
            )}
          </span>
          <div className="flex flex-col">
            <span
              className={cn(
                "text-xs font-medium",
                step.state === "upcoming" || step.state === "stopped"
                  ? "text-muted-foreground"
                  : "text-foreground",
                step.state === "failed" && "text-destructive",
              )}
            >
              {step.label}
              <span className="sr-only">
                {step.state === "done"
                  ? " — concluída"
                  : step.state === "current"
                    ? " — em andamento"
                    : ""}
              </span>
            </span>
            {step.date ? (
              <span className="text-[0.7rem] text-muted-foreground tabular-nums">
                {dateFmt.format(step.date)}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
