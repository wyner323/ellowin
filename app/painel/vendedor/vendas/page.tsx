import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { CheckCircle2, Clock, Lock } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { LiveRefresh } from "@/components/live-refresh"
import { FilterPills, type PillItem } from "@/components/filter-pills"
import { OrderRow } from "@/components/orders/order-row"
import { Pagination } from "@/components/pagination"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { StatTiles } from "@/components/stat-tiles"
import { Button } from "@/components/ui/button"
import { getSellerUnansweredQuestionsCount } from "@/lib/marketplace"
import { formatCents } from "@/lib/money"
import {
  ORDER_STATUS_LABEL,
  getSellerOrderAggregates,
  getSellerOrdersPage,
} from "@/lib/orders"
import { parsePage } from "@/lib/pagination"
import { getSession } from "@/lib/session"
import { sweepAutoRelease, sweepDeliveryDeadline } from "@/lib/sla"

export const metadata: Metadata = {
  title: "Minhas vendas",
}

/** Rótulos curtos das pílulas, na voz do vendedor (o status "entregue" é ele esperando). */
const PILL_LABEL: Record<string, string> = {
  aguardando_entrega: "A entregar",
  entregue: "Aguardando comprador",
  em_disputa: "Em disputa",
  concluido: "Concluídas",
  reembolsado: "Reembolsadas",
  cancelado: "Canceladas",
}

const RECEIVABLE = ["aguardando_entrega", "entregue", "em_disputa"]

export default async function VendasPage({
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

  const [list, aggregates, pendingQuestions] = await Promise.all([
    getSellerOrdersPage(session.user.id, { status, page: parsePage(sp.pagina) }),
    getSellerOrderAggregates(session.user.id),
    getSellerUnansweredQuestionsCount(session.user.id),
  ])

  const count = (s: string) => aggregates.stat(s)?.count ?? 0
  const receivableCents = RECEIVABLE.reduce((sum, s) => sum + (aggregates.stat(s)?.totalCents ?? 0), 0)
  const concluded = aggregates.stat("concluido")

  const pills: PillItem[] = [
    { value: "todos", label: "Todas", count: list.allCount },
    ...Object.keys(PILL_LABEL)
      .filter((s) => count(s) > 0 || s === status)
      .map((s) => ({ value: s, label: PILL_LABEL[s], count: count(s) })),
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <LiveRefresh />
      <SiteHeader />
      <SellerTabs pendingQuestions={pendingQuestions} />

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
          <header className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">Minhas vendas</h1>
            <p className="text-sm text-muted-foreground">
              Entregue os pedidos no prazo: é a entrega confirmada que libera o valor para o seu saldo.
            </p>
          </header>

          {list.allCount === 0 ? (
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
            <>
              <StatTiles
                tiles={[
                  {
                    icon: Clock,
                    label: list.pendingCount === 1 ? "pedido a entregar" : "pedidos a entregar",
                    value: String(list.pendingCount),
                    tone: list.pendingCount > 0 ? "gold" : undefined,
                  },
                  {
                    icon: Lock,
                    label: "a receber (em custódia)",
                    value: formatCents(receivableCents),
                  },
                  {
                    icon: CheckCircle2,
                    label: `${concluded?.count ?? 0} ${(concluded?.count ?? 0) === 1 ? "venda concluída" : "vendas concluídas"}`,
                    value: formatCents(concluded?.totalCents ?? 0),
                    tone: "success",
                  },
                ]}
              />

              <FilterPills
                items={pills}
                active={status ?? "todos"}
                basePath="/painel/vendedor/vendas"
                label="Filtrar vendas por status"
              />

              <ul className="flex flex-col gap-3">
                {list.orders.map((o) => (
                  <li key={o.id}>
                    <OrderRow
                      order={o}
                      role="vendedor"
                      counterparty={o.buyerName ?? "Comprador"}
                      amountCents={o.sellerNetCents}
                      amountCaption="líquido"
                    />
                  </li>
                ))}
              </ul>

              <Pagination
                page={list.page}
                pages={list.pages}
                total={list.total}
                basePath="/painel/vendedor/vendas"
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
