import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, ShieldAlert } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { DisputeChat } from "@/components/disputes/dispute-chat"
import { SlaBadge, SlaPanel } from "@/components/disputes/sla-panel"
import { Button } from "@/components/ui/button"
import { DISPUTE_REASONS } from "@/lib/disputes"
import { formatCents } from "@/lib/money"
import { DISPUTE_STATUS_LABEL, getDisputeMessages, getOrderDetail } from "@/lib/orders"
import { getStaff } from "@/lib/roles"
import { getSession } from "@/lib/session"
import { sweepDisputeSla } from "@/lib/sla"

export const metadata: Metadata = {
  title: "Disputa do pedido",
}

export default async function DisputaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const orderId = Number(id)
  if (!Number.isInteger(orderId)) notFound()

  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  // Não há cron neste ambiente: a trava de SLA roda ao abrir a tela.
  await sweepDisputeSla()

  const staff = await getStaff()
  const detail = await getOrderDetail(orderId, session.user.id, Boolean(staff))
  if (!detail?.dispute) notFound()

  const { dispute, viewer } = detail
  const viewerRole = viewer.isBuyer ? "buyer" : viewer.isSeller ? "seller" : "moderator"
  const isModerator = viewerRole === "moderator"
  const messages = await getDisputeMessages(dispute.id, isModerator)
  const closed = dispute.status.startsWith("resolvida") || dispute.status === "cancelada"

  const reasonLabel =
    DISPUTE_REASONS.find((r) => r.value === dispute.reason)?.label ?? dispute.reason

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
          <div>
            <Button
              render={<Link href={`/pedidos/${orderId}`} />}
              variant="ghost"
              size="sm"
              className="-ml-2"
            >
              <ArrowLeft className="size-4" />
              Voltar ao pedido
            </Button>
          </div>

          <header className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldAlert className="size-3.5 text-destructive" aria-hidden="true" />
                Disputa #{dispute.id} · Pedido #{orderId}
              </span>
              <SlaBadge
                status={dispute.status}
                resolutionDueAt={dispute.resolutionDueAt}
              />
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="text-xl font-semibold tracking-tight text-pretty">
                  {detail.productTitle}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {reasonLabel} · {DISPUTE_STATUS_LABEL[dispute.status] ?? dispute.status}
                </p>
              </div>
              <div className="flex flex-col items-end">
                <strong className="font-display text-xl font-bold tracking-tight">
                  {formatCents(detail.amountCents)}
                </strong>
                <span className="text-xs text-muted-foreground">bloqueados</span>
              </div>
            </div>

            <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              Apenas o valor desta transação está bloqueado — o restante do saldo do
              vendedor segue liberado. O suporte da Ellowin acompanha a conversa e
              pode intervir a qualquer momento.
            </p>

            {dispute.resolution ? (
              <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
                <strong className="font-semibold">Decisão: </strong>
                {dispute.resolution}
              </p>
            ) : null}
          </header>

          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">Prazos do caso</h2>
            <SlaPanel dispute={dispute} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Conversa</h2>
            <DisputeChat
              disputeId={dispute.id}
              messages={messages}
              viewerRole={viewerRole}
              canPostInternal={isModerator}
              closed={closed}
            />
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
