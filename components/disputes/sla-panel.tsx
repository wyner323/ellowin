import { CheckCircle2, Clock, TriangleAlert } from "lucide-react"
import { formatDeadline, slaState } from "@/lib/sla"
import { cn } from "@/lib/utils"

const STATE_STYLE: Record<string, string> = {
  no_prazo: "border-primary/30 bg-primary/10 text-primary",
  atencao: "border-chart-4/40 bg-chart-4/10 text-chart-4",
  atrasado: "border-destructive/40 bg-destructive/10 text-destructive",
  encerrado: "border-border bg-muted/50 text-muted-foreground",
}

const STATE_LABEL: Record<string, string> = {
  no_prazo: "No prazo",
  atencao: "Prazo apertado",
  atrasado: "Prazo estourado",
  encerrado: "Encerrada",
}

/** Selo de SLA usado na fila e no cabeçalho do caso. */
export function SlaBadge({
  status,
  resolutionDueAt,
}: {
  status: string
  resolutionDueAt: Date
}) {
  const state = slaState({ status, resolutionDueAt })
  const Icon =
    state === "atrasado" ? TriangleAlert : state === "encerrado" ? CheckCircle2 : Clock

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium",
        STATE_STYLE[state],
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {STATE_LABEL[state]}
    </span>
  )
}

/**
 * Os três prazos do SLA acordado: 24h para o primeiro contato do suporte, 48h
 * úteis para o vendedor responder (com reembolso automático se estourar) e 48h
 * para a resolução completa.
 */
export function SlaPanel({
  dispute,
}: {
  dispute: {
    status: string
    createdAt: Date
    firstContactDueAt: Date
    sellerResponseDueAt: Date
    resolutionDueAt: Date
    sellerFirstResponseAt: Date | null
  }
}) {
  const rows = [
    {
      label: "Primeiro contato do suporte",
      due: dispute.firstContactDueAt,
      done: dispute.status !== "aberta",
      note: "24h úteis",
    },
    {
      label: "Resposta do vendedor",
      due: dispute.sellerResponseDueAt,
      done: Boolean(dispute.sellerFirstResponseAt),
      note: "48h úteis — sem resposta, o comprador é reembolsado automaticamente",
    },
    {
      label: "Resolução final",
      due: dispute.resolutionDueAt,
      done: dispute.status.startsWith("resolvida") || dispute.status === "cancelada",
      note: "48h úteis do início ao fim",
    },
  ]

  return (
    <dl className="flex flex-col gap-3">
      {rows.map((row) => {
        const late = !row.done && row.due.getTime() < Date.now()

        return (
          <div key={row.label} className="flex flex-col gap-0.5">
            <dt className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {row.done ? (
                <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
              ) : late ? (
                <TriangleAlert className="size-3.5 text-destructive" aria-hidden="true" />
              ) : (
                <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
              )}
              {row.label}
              <span
                className={cn(
                  "text-xs font-normal",
                  late ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {row.done ? "concluído" : `até ${formatDeadline(row.due)}`}
              </span>
            </dt>
            <dd className="pl-5 text-xs text-muted-foreground">{row.note}</dd>
          </div>
        )
      })}
    </dl>
  )
}
