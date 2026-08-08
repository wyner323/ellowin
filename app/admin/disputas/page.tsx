import Link from "next/link"
import { ChevronRight, Inbox } from "lucide-react"
import { SlaBadge } from "@/components/disputes/sla-panel"
import { DISPUTE_REASONS } from "@/lib/disputes"
import { formatCents } from "@/lib/money"
import { DISPUTE_STATUS_LABEL, getDisputeQueue } from "@/lib/orders"
import { sweepDisputeSla } from "@/lib/sla"

const OPEN_STATUSES = ["aberta", "em_analise"]

function reasonLabel(value: string) {
  return DISPUTE_REASONS.find((r) => r.value === value)?.label ?? value
}

export default async function FilaDisputasPage() {
  // A trava de SLA roda ao abrir a fila: sem cron, este é o gatilho natural.
  await sweepDisputeSla()

  const all = await getDisputeQueue()
  const open = all.filter((d) => OPEN_STATUSES.includes(d.status))
  const closed = all.filter((d) => !OPEN_STATUSES.includes(d.status))

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Fila de disputas</h1>
        <p className="text-sm text-muted-foreground">
          Ordenada pelo prazo de resolução. Qualquer moderador pode abrir um caso e
          dar continuidade, independente de quem atendeu primeiro.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
          <span className="text-xs text-muted-foreground">Casos abertos</span>
          <strong className="font-display text-2xl font-bold">{open.length}</strong>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
          <span className="text-xs text-muted-foreground">Sem atendimento</span>
          <strong className="font-display text-2xl font-bold">
            {open.filter((d) => !d.moderatorId).length}
          </strong>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
          <span className="text-xs text-muted-foreground">Valor bloqueado</span>
          <strong className="font-display text-2xl font-bold">
            {formatCents(open.reduce((sum, d) => sum + (d.amountCents ?? 0), 0))}
          </strong>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Em aberto</h2>

        {open.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-10 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Inbox className="size-5" aria-hidden="true" />
            </span>
            <p className="font-medium">Nenhuma disputa em aberto</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/admin/disputas/${d.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Disputa #{d.id} · Pedido #{d.orderId}
                      </span>
                      <SlaBadge status={d.status} resolutionDueAt={d.resolutionDueAt} />
                      {!d.moderatorId ? (
                        <span className="rounded-full bg-chart-4/15 px-2 py-0.5 text-[0.7rem] font-medium text-chart-4">
                          Sem atendimento
                        </span>
                      ) : null}
                    </div>
                    <span className="truncate font-medium">{d.productTitle}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {reasonLabel(d.reason)} · {d.buyerName ?? "Comprador"} ↔{" "}
                      {d.sellerName ?? "Vendedor"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <strong className="text-lg font-bold tracking-tight">
                      {formatCents(d.amountCents ?? 0)}
                    </strong>
                    <ChevronRight
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {closed.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Encerradas</h2>
          <ul className="flex flex-col gap-2">
            {closed.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/admin/disputas/${d.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 transition-colors hover:border-primary/40"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{d.productTitle}</span>
                    <span className="text-xs text-muted-foreground">
                      Disputa #{d.id} ·{" "}
                      {DISPUTE_STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </span>
                  <span className="text-sm font-medium">
                    {formatCents(d.amountCents ?? 0)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
