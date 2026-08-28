import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { LiveRefresh } from "@/components/live-refresh"
import { DisputeChat } from "@/components/disputes/dispute-chat"
import { ResolveDispute } from "@/components/disputes/resolve-dispute"
import { SlaBadge, SlaPanel } from "@/components/disputes/sla-panel"
import { Button } from "@/components/ui/button"
import { DISPUTE_REASONS } from "@/lib/disputes"
import { formatCents } from "@/lib/money"
import {
  DISPUTE_STATUS_LABEL,
  getDisputeDetail,
  getDisputeMessages,
  getOrderDetail,
} from "@/lib/orders"
import { requireStaff } from "@/lib/roles"
import { sweepDisputeSla } from "@/lib/sla"

export default async function CasoDisputaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const disputeId = Number(id)
  if (!Number.isInteger(disputeId)) notFound()

  const staff = await requireStaff()
  await sweepDisputeSla()

  const dispute = await getDisputeDetail(disputeId)
  if (!dispute) notFound()

  const [order, messages] = await Promise.all([
    getOrderDetail(dispute.orderId, staff.id, true),
    // A moderação lê tudo, inclusive as notas internas.
    getDisputeMessages(dispute.id, true),
  ])

  if (!order) notFound()

  const closed = dispute.status.startsWith("resolvida") || dispute.status === "cancelada"
  const reasonLabel =
    DISPUTE_REASONS.find((r) => r.value === dispute.reason)?.label ?? dispute.reason

  const facts = [
    { label: "Comprador", value: `${order.buyerName ?? "—"} · ${order.buyerEmail ?? ""}` },
    {
      label: "Vendedor",
      value: `${order.storeName ?? order.sellerName ?? "—"} · ${order.sellerEmail ?? ""}`,
    },
    { label: "Item", value: `${order.productTitle} — ${order.variantLabel}` },
    {
      label: "Valor bloqueado",
      value: `${formatCents(order.amountCents)} (líquido do vendedor: ${formatCents(order.sellerNetCents)})`,
    },
    { label: "Status do pedido", value: order.status },
  ]

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <LiveRefresh intervalMs={30000} />
      <div>
        <Button
          render={<Link href="/admin/disputas" />}
          variant="ghost"
          size="sm"
          className="-ml-2"
        >
          <ArrowLeft className="size-4" />
          Fila de disputas
        </Button>
      </div>

      <header className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Disputa #{dispute.id} · Pedido #{dispute.orderId}
          </span>
          <SlaBadge status={dispute.status} resolutionDueAt={dispute.resolutionDueAt} />
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
            {DISPUTE_STATUS_LABEL[dispute.status] ?? dispute.status}
          </span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-pretty">
              {reasonLabel}
            </h1>
            <p className="text-sm text-muted-foreground">
              {dispute.moderatorId
                ? dispute.moderatorId === staff.id
                  ? "Atribuída a você"
                  : "Já atribuída a outro moderador — você pode dar continuidade"
                : "Sem moderador atribuído"}
            </p>
          </div>

          <Button
            render={<Link href={`/pedidos/${dispute.orderId}`} />}
            variant="outline"
            size="sm"
          >
            <ExternalLink className="size-4" />
            Ver pedido
          </Button>
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Dados do caso</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="text-sm break-words">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Prazos do SLA</h2>
        <SlaPanel dispute={dispute} />
      </section>

      {order.deliveryPayload ? (
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Dados entregues pelo vendedor</h2>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {order.deliveryPayload}
          </pre>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">
          Histórico completo
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            inclui notas internas da moderação
          </span>
        </h2>
        <DisputeChat
          disputeId={dispute.id}
          messages={messages}
          viewerRole="moderator"
          canPostInternal
          closed={closed}
        />
      </section>

      {closed ? (
        <section className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/10 p-5">
          <h2 className="text-sm font-semibold text-primary">Caso encerrado</h2>
          <p className="text-sm text-primary">{dispute.resolution}</p>
        </section>
      ) : (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Decisão final</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Apenas o valor desta transação é movimentado. Se o vendedor não
            responder até o prazo de 48h úteis, o reembolso ao comprador acontece
            automaticamente.
          </p>
          <ResolveDispute
            disputeId={dispute.id}
            amountCents={order.amountCents}
            sellerNetCents={order.sellerNetCents}
            claimed={Boolean(dispute.moderatorId)}
          />
        </section>
      )}
    </div>
  )
}
