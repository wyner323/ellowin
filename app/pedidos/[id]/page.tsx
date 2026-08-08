import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, MessageSquare, ShieldCheck } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { OrderActions } from "@/components/orders/order-actions"
import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { OpenDisputeForm } from "@/components/orders/open-dispute-form"
import { ReviewForm } from "@/components/orders/review-form"
import { StarRating } from "@/components/marketplace/star-rating"
import { Button } from "@/components/ui/button"
import { formatCents } from "@/lib/money"
import { getOrderDetail } from "@/lib/orders"
import { getStaff } from "@/lib/roles"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Detalhe do pedido",
}

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const orderId = Number(id)
  if (!Number.isInteger(orderId)) notFound()

  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const staff = await getStaff()
  const detail = await getOrderDetail(orderId, session.user.id, Boolean(staff))
  if (!detail) notFound()

  const { viewer } = detail
  const counterparty = viewer.isBuyer
    ? (detail.storeName ?? detail.sellerName ?? "Vendedor")
    : (detail.buyerName ?? "Comprador")

  const canReview =
    viewer.isBuyer && detail.status === "concluido" && !detail.review

  const canOpenDispute =
    viewer.isBuyer &&
    !detail.dispute &&
    ["aguardando_entrega", "entregue"].includes(detail.status)

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
          <div>
            <Button
              render={<Link href={viewer.isSeller ? "/painel/vendedor/vendas" : "/pedidos"} />}
              variant="ghost"
              size="sm"
              className="-ml-2"
            >
              <ArrowLeft className="size-4" />
              {viewer.isSeller ? "Minhas vendas" : "Minhas compras"}
            </Button>
          </div>

          <header className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Pedido #{detail.id}</span>
              <OrderStatusBadge status={detail.status} />
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="text-xl font-semibold tracking-tight text-pretty">
                  {detail.productTitle}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {detail.variantLabel} · {viewer.isBuyer ? "Vendedor" : "Comprador"}:{" "}
                  {counterparty}
                </p>
              </div>
              <strong className="font-display text-2xl font-bold tracking-tight">
                {formatCents(detail.amountCents)}
              </strong>
            </div>

            {viewer.isSeller ? (
              <p className="text-xs text-muted-foreground">
                Você recebe {formatCents(detail.sellerNetCents)} após a confirmação
                (taxa da plataforma: {formatCents(detail.feeCents)}).
              </p>
            ) : null}
          </header>

          {detail.status === "aguardando_entrega" ? (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {formatCents(detail.amountCents)} estão retidos em custódia. O vendedor
              só recebe depois que o comprador confirmar a entrega.
            </p>
          ) : null}

          {detail.deliveryPayload ? (
            <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Dados da entrega</h2>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                {detail.deliveryPayload}
              </pre>
            </section>
          ) : null}

          {detail.dispute ? (
            <section className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
              <h2 className="text-sm font-semibold">Este pedido está em disputa</h2>
              <p className="text-sm text-muted-foreground">
                A conversa com {viewer.isBuyer ? "o vendedor" : "o comprador"} e o
                suporte da Ellowin acontece no chat do caso.
              </p>
              <Button
                render={<Link href={`/pedidos/${detail.id}/disputa`} />}
                className="self-start"
              >
                <MessageSquare className="size-4" />
                Abrir chat da disputa
              </Button>
            </section>
          ) : null}

          {viewer.isBuyer || viewer.isSeller ? (
            <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Ações</h2>
              <OrderActions
                orderId={detail.id}
                status={detail.status}
                isBuyer={viewer.isBuyer}
                isSeller={viewer.isSeller}
              />
              {canOpenDispute ? (
                <OpenDisputeForm orderId={detail.id} amountCents={detail.amountCents} />
              ) : null}
            </section>
          ) : null}

          {canReview ? (
            <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Avalie o vendedor</h2>
              <ReviewForm orderId={detail.id} />
            </section>
          ) : null}

          {detail.review ? (
            <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Avaliação registrada</h2>
              <StarRating rating={detail.review.rating} size="md" />
              {detail.review.comment ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {detail.review.comment}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
