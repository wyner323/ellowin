import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, ChevronRight, Store } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { LiveRefresh } from "@/components/live-refresh"
import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { Button } from "@/components/ui/button"
import { formatCents } from "@/lib/money"
import { getSellerOrders } from "@/lib/orders"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Minhas vendas",
}

export default async function VendasPage() {
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const orders = await getSellerOrders(session.user.id)
  const pending = orders.filter((o) => o.status === "aguardando_entrega")

  return (
    <div className="flex min-h-screen flex-col">
      <LiveRefresh />
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
          <div>
            <Button
              render={<Link href="/painel/vendedor" />}
              variant="ghost"
              size="sm"
              className="-ml-2"
            >
              <ArrowLeft className="size-4" />
              Painel do vendedor
            </Button>
          </div>

          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Minhas vendas</h1>
            <p className="text-sm text-muted-foreground">
              {pending.length > 0
                ? `${pending.length} ${pending.length === 1 ? "pedido aguarda" : "pedidos aguardam"} entrega.`
                : "Nenhuma entrega pendente."}
            </p>
          </header>

          {orders.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-10 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Store className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium">Você ainda não vendeu nada</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Publique anúncios para aparecer na vitrine.
                </p>
              </div>
              <Button render={<Link href="/painel/vendedor/produtos/novo" />} size="sm">
                Criar anúncio
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/pedidos/${o.id}`}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Pedido #{o.id}
                        </span>
                        <OrderStatusBadge status={o.status} role="vendedor" />
                      </div>
                      <span className="truncate font-medium">{o.productTitle}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {o.variantLabel} · {o.buyerName ?? "Comprador"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end">
                        <strong className="text-lg font-bold tracking-tight">
                          {formatCents(o.sellerNetCents)}
                        </strong>
                        <span className="text-[0.7rem] text-muted-foreground">
                          líquido
                        </span>
                      </div>
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
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
