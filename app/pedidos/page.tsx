import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { Lock, PackageCheck, Star } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { LiveRefresh } from "@/components/live-refresh"
import { FilterPills, type PillItem } from "@/components/filter-pills"
import { OrderRow } from "@/components/orders/order-row"
import { Pagination } from "@/components/pagination"
import { StatTiles } from "@/components/stat-tiles"
import { Button } from "@/components/ui/button"
import { formatCents } from "@/lib/money"
import { ORDER_STATUS_LABEL, getBuyerOrderSummary, getBuyerOrdersPage } from "@/lib/orders"
import { parsePage } from "@/lib/pagination"
import { sweepAutoRelease, sweepDeliveryDeadline } from "@/lib/sla"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Minhas compras",
  description: "Acompanhe suas compras, confirme entregas e avalie vendedores na Ellowin.",
}

/** Rótulos curtos das pílulas, na voz do comprador. */
const PILL_LABEL: Record<string, string> = {
  aguardando_entrega: "Aguardando entrega",
  entregue: "Confirmar recebimento",
  em_disputa: "Em disputa",
  concluido: "Concluídas",
  reembolsado: "Reembolsadas",
  cancelado: "Canceladas",
}

const IN_ESCROW = ["aguardando_entrega", "entregue", "em_disputa"]

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; pagina?: string }>
}) {
  const sp = await searchParams
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  // Sem cron neste ambiente: os prazos são varridos ao abrir a lista.
  await Promise.all([sweepDeliveryDeadline(), sweepAutoRelease()])

  // Status desconhecido na URL é ignorado (mostra todos), nunca vira filtro.
  const status = sp.status && sp.status in ORDER_STATUS_LABEL ? sp.status : undefined

  const [list, summary] = await Promise.all([
    getBuyerOrdersPage(session.user.id, { status, page: parsePage(sp.pagina) }),
    getBuyerOrderSummary(session.user.id),
  ])

  const count = (s: string) => summary.stat(s)?.count ?? 0
  const toConfirm = count("entregue")
  const inEscrowCents = IN_ESCROW.reduce((sum, s) => sum + (summary.stat(s)?.totalCents ?? 0), 0)

  const pills: PillItem[] = [
    { value: "todos", label: "Todas", count: summary.allCount },
    ...Object.keys(PILL_LABEL)
      .filter((s) => count(s) > 0 || s === status)
      .map((s) => ({ value: s, label: PILL_LABEL[s], count: count(s) })),
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <LiveRefresh />
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
          <header className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">Minhas compras</h1>
            <p className="text-sm text-muted-foreground">
              Confirme o recebimento para liberar o pagamento ao vendedor, avalie a compra ou abra
              uma disputa se algo der errado.
            </p>
          </header>

          {summary.allCount === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center">
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
            <>
              <StatTiles
                tiles={[
                  {
                    icon: PackageCheck,
                    label: toConfirm === 1 ? "entrega para confirmar" : "entregas para confirmar",
                    value: String(toConfirm),
                    tone: toConfirm > 0 ? "primary" : undefined,
                  },
                  {
                    icon: Lock,
                    label: "em custódia",
                    value: formatCents(inEscrowCents),
                  },
                  {
                    icon: Star,
                    label:
                      summary.pendingReviews === 1 ? "avaliação pendente" : "avaliações pendentes",
                    value: String(summary.pendingReviews),
                    tone: summary.pendingReviews > 0 ? "gold" : undefined,
                  },
                ]}
              />

              <FilterPills
                items={pills}
                active={status ?? "todos"}
                basePath="/pedidos"
                label="Filtrar compras por status"
              />

              <ul className="flex flex-col gap-3">
                {list.orders.map((o) => (
                  <li key={o.id}>
                    <OrderRow
                      order={o}
                      role="comprador"
                      counterparty={o.storeName ?? o.sellerName ?? "Vendedor"}
                      amountCents={o.amountCents}
                      badge={
                        o.status === "concluido" && !o.reviewed ? (
                          <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[0.7rem] font-medium text-gold">
                            Avaliação pendente
                          </span>
                        ) : null
                      }
                    />
                  </li>
                ))}
              </ul>

              <Pagination
                page={list.page}
                pages={list.pages}
                total={list.total}
                basePath="/pedidos"
                params={{ status }}
              />
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
