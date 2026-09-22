import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { LiveRefresh } from "@/components/live-refresh"
import { SellerOrdersList } from "@/components/seller/seller-orders-list"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { Button } from "@/components/ui/button"
import { getSellerUnansweredQuestionsCount } from "@/lib/marketplace"
import { getSellerOrders } from "@/lib/orders"
import { getSession } from "@/lib/session"
import { sweepAutoRelease, sweepDeliveryDeadline } from "@/lib/sla"

export const metadata: Metadata = {
  title: "Minhas vendas",
}

export default async function VendasPage() {
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  // Sem cron neste ambiente: os prazos são varridos ao abrir a lista.
  await Promise.all([sweepDeliveryDeadline(), sweepAutoRelease()])

  const [orders, pendingQuestions] = await Promise.all([
    getSellerOrders(session.user.id),
    getSellerUnansweredQuestionsCount(session.user.id),
  ])
  const pending = orders.filter((o) => o.status === "aguardando_entrega")

  return (
    <div className="flex min-h-screen flex-col">
      <LiveRefresh />
      <SiteHeader />
      <SellerTabs pendingQuestions={pendingQuestions} />

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
            <SellerOrdersList orders={orders} />
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
