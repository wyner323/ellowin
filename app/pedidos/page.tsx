import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { LiveRefresh } from "@/components/live-refresh"
import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { Button } from "@/components/ui/button"
import { formatCents } from "@/lib/money"
import { Pagination } from "@/components/pagination"
import { getBuyerOrdersPage } from "@/lib/orders"
import { parsePage } from "@/lib/pagination"
import { sweepAutoRelease, sweepDeliveryDeadline } from "@/lib/sla"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Minhas compras",
  description: "Acompanhe suas compras, confirme entregas e avalie vendedores na Ellowin.",
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>
}) {
  const sp = await searchParams
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  // Sem cron neste ambiente: os prazos são varridos ao abrir a lista.
  await Promise.all([sweepDeliveryDeadline(), sweepAutoRelease()])

  const { orders, total, page, pages } = await getBuyerOrdersPage(
    session.user.id,
    parsePage(sp.pagina),
  )

  return (
    <div className="flex min-h-screen flex-col">
      <LiveRefresh />
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-10">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Minhas compras</h1>
            <p className="text-sm text-muted-foreground">
              Confirme o recebimento para liberar o pagamento ao vendedor, avalie a
              compra ou abra uma disputa se algo der errado.
            </p>
          </header>

          {total === 0 ? (
            <div className="mt-8 flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-10 text-center">
              <div className="relative h-28 w-28">
                <Image
                  src="/images/mascote/ello-repouso.png"
                  alt=""
                  fill
                  sizes="112px"
                  className="object-contain"
                />
              </div>
              <div>
                <p className="font-medium">Você ainda não comprou nada</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Explore o catálogo e escolha o item que precisa.
                </p>
              </div>
              <Button render={<Link href="/" />} size="sm">
                Ver anúncios
              </Button>
            </div>
          ) : (
            <ul className="mt-6 flex flex-col gap-3">
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
                        <OrderStatusBadge status={o.status} />
                        {o.status === "concluido" && !o.reviewed ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-medium text-primary">
                            Avaliação pendente
                          </span>
                        ) : null}
                      </div>
                      <span className="truncate font-medium">{o.productTitle}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {o.variantLabel} · {o.storeName ?? o.sellerName ?? "Vendedor"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <strong className="text-lg font-bold tracking-tight">
                        {formatCents(o.amountCents)}
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

          <Pagination
            page={page}
            pages={pages}
            total={total}
            basePath="/pedidos"
            className="mt-6"
          />
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
