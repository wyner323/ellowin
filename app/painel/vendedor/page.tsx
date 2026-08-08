import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Package, Plus, ShieldAlert, Store, TrendingUp } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { StarRating } from "@/components/marketplace/star-rating"
import { Button } from "@/components/ui/button"
import { db } from "@/lib/db"
import { sellerApplication } from "@/lib/db/schema"
import { getSellerStats } from "@/lib/marketplace"
import { formatCents } from "@/lib/money"
import { getMyDisputes, getSellerOrders } from "@/lib/orders"
import { getSession } from "@/lib/session"
import { getWalletSummary } from "@/lib/wallet"
import { eq } from "drizzle-orm"

export const metadata: Metadata = {
  title: "Painel do vendedor",
  description: "Gerencie anúncios, vendas e repasses da sua loja na Ellowin.",
}

export default async function PainelVendedorPage() {
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const [application] = await db
    .select()
    .from(sellerApplication)
    .where(eq(sellerApplication.userId, session.user.id))
    .limit(1)

  if (!application || application.status !== "aprovado") redirect("/vender")

  const [stats, orders, wallet, disputes] = await Promise.all([
    getSellerStats(session.user.id),
    getSellerOrders(session.user.id),
    getWalletSummary(session.user.id),
    getMyDisputes(session.user.id),
  ])

  const pending = orders.filter((o) => o.status === "aguardando_entrega")
  const openDisputes = disputes.filter(
    (d) => d.status === "aberta" || d.status === "em_analise",
  )

  const cards = [
    {
      label: "Saldo disponível",
      value: formatCents(wallet.availableCents),
      hint: "Liberado para saque",
      icon: TrendingUp,
    },
    {
      label: "Em custódia",
      value: formatCents(wallet.heldCents),
      hint: "Aguardando confirmação",
      icon: Store,
    },
    {
      label: "Vendas concluídas",
      value: String(stats.salesCount),
      hint: `${stats.products} ${stats.products === 1 ? "anúncio" : "anúncios"}`,
      icon: Package,
    },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {application.storeName ?? "Sua loja"}
              </h1>
              <div className="flex items-center gap-2">
                <StarRating rating={stats.rating} count={stats.ratingCount} />
                <span className="text-sm text-muted-foreground">
                  Nível {application.level}
                </span>
              </div>
            </div>

            <Button render={<Link href="/painel/vendedor/produtos/novo" />}>
              <Plus className="size-4" />
              Novo anúncio
            </Button>
          </header>

          <div className="grid gap-3 sm:grid-cols-3">
            {cards.map((card) => (
              <div
                key={card.label}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
              >
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <card.icon className="size-3.5" aria-hidden="true" />
                  {card.label}
                </span>
                <strong className="font-display text-2xl font-bold tracking-tight">
                  {card.value}
                </strong>
                <span className="text-xs text-muted-foreground">{card.hint}</span>
              </div>
            ))}
          </div>

          {openDisputes.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="flex items-center gap-2 text-sm">
                <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
                {openDisputes.length}{" "}
                {openDisputes.length === 1 ? "disputa aberta" : "disputas abertas"} —
                responda em até 48h úteis para não perder o valor.
              </p>
              <Button
                render={<Link href={`/pedidos/${openDisputes[0].orderId}/disputa`} />}
                size="sm"
                variant="outline"
              >
                Ver disputa
              </Button>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/painel/vendedor/produtos"
              className="flex flex-col gap-1 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
            >
              <span className="font-medium">Meus anúncios</span>
              <span className="text-sm text-muted-foreground">
                Editar itens, preços e estoque
              </span>
            </Link>

            <Link
              href="/painel/vendedor/vendas"
              className="flex flex-col gap-1 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
            >
              <span className="font-medium">
                Minhas vendas
                {pending.length > 0 ? (
                  <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                    {pending.length} a entregar
                  </span>
                ) : null}
              </span>
              <span className="text-sm text-muted-foreground">
                Registrar entregas e acompanhar repasses
              </span>
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
