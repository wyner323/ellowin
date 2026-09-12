import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ExternalLink, Gauge, Package, Plus, ShieldAlert, Store, TrendingUp } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { LiveRefresh } from "@/components/live-refresh"
import { BannerUpload } from "@/components/account/banner-upload"
import { BalanceTrendChart, SalesPerformanceCard, TrendBadge } from "@/components/seller/dashboard-charts"
import { StarRating } from "@/components/marketplace/star-rating"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { sellerApplication, user } from "@/lib/db/schema"
import { getSellerDeliveryStats, getSellerStats } from "@/lib/marketplace"
import { formatCents } from "@/lib/money"
import { getMyDisputes, getSellerOrders } from "@/lib/orders"
import { getSession } from "@/lib/session"
import { sweepDeliveryDeadline } from "@/lib/sla"
import { formatDurationHours } from "@/lib/time"
import { getWalletEntries, getWalletSummary } from "@/lib/wallet"
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

  // Sem cron neste ambiente: varre antes do Promise.all abaixo, já que
  // getSellerOrders() está dentro dele.
  await sweepDeliveryDeadline()

  const [stats, orders, wallet, walletEntries, delivery, disputes, [profileRow]] = await Promise.all([
    getSellerStats(session.user.id),
    getSellerOrders(session.user.id),
    getWalletSummary(session.user.id),
    getWalletEntries(session.user.id, 60),
    getSellerDeliveryStats(session.user.id),
    getMyDisputes(session.user.id),
    db
      .select({ bannerUrl: user.bannerUrl })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1),
  ])

  const pending = orders.filter((o) => o.status === "aguardando_entrega")
  const openDisputes = disputes.filter(
    (d) => d.status === "aberta" || d.status === "em_analise",
  )

  // Ledger já vem em ordem decrescente; inverte pra desenhar o gráfico em
  // ordem cronológica, e cada linha já carrega o saldo resultante — sem
  // agregação nenhuma.
  const balanceHistory = [...walletEntries].reverse().map((e) => ({
    label: e.createdAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    balanceCents: e.balanceAfterCents,
  }))

  // Vendas concluídas dos últimos 60 dias, agrupadas por dia (dias sem venda
  // ficam zerados pra manter o eixo contínuo) — deriva de `orders`, já
  // buscado acima pra calcular `escrowCents`, sem query nova. 60 dias é o
  // dobro do maior período selecionável no card (30d), pra sempre sobrar um
  // "período anterior" completo pra comparar (o recorte por período e a
  // comparação em si acontecem no client, em SalesPerformanceCard).
  const salesByDay = new Map<string, { count: number; totalCents: number }>()
  for (let i = 59; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    salesByDay.set(d.toISOString().slice(0, 10), { count: 0, totalCents: 0 })
  }
  for (const o of orders) {
    if (o.status !== "concluido" || !o.completedAt) continue
    const key = o.completedAt.toISOString().slice(0, 10)
    const bucket = salesByDay.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.totalCents += o.sellerNetCents
    }
  }
  const salesTimeline = Array.from(salesByDay, ([date, { count, totalCents }]) => {
    // Monta a data pelos componentes (não `new Date(dateString)`, que o JS
    // interpreta como UTC-meia-noite) pra garantir que o rótulo sempre bate
    // com o dia da própria chave, não importa o fuso do processo.
    const [y, m, d] = date.split("-").map(Number)
    const label = new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    })
    return { label, count, totalCents }
  })

  // Variação do saldo entre o lançamento mais antigo e o mais recente
  // mostrados no gráfico (não é um período fixo — segue a janela real dos
  // últimos 60 lançamentos, que pode cobrir dias ou meses dependendo do
  // volume de movimentação).
  const balanceDeltaCents =
    balanceHistory.length >= 2
      ? balanceHistory[balanceHistory.length - 1].balanceCents - balanceHistory[0].balanceCents
      : null

  // A custódia fica na carteira do comprador até a liberação, então o valor a
  // receber do vendedor vem dos pedidos ainda não concluídos, não do seu saldo.
  const escrowCents = orders
    .filter((o) =>
      ["aguardando_entrega", "entregue", "em_disputa"].includes(o.status),
    )
    .reduce((total, o) => total + o.sellerNetCents, 0)

  const cards = [
    {
      label: "Saldo disponível",
      value: formatCents(wallet.availableCents),
      hint: "Liberado para saque",
      icon: TrendingUp,
    },
    {
      label: "A receber",
      value: formatCents(escrowCents),
      hint: "Em custódia até a confirmação",
      icon: Store,
    },
    {
      label: "Vendas concluídas",
      value: String(stats.salesCount),
      hint: `${stats.products} ${stats.products === 1 ? "anúncio" : "anúncios"}`,
      icon: Package,
    },
    {
      label: "Velocidade de entrega",
      value: delivery.total > 0 ? `${delivery.onTimePercent}%` : "—",
      hint:
        delivery.total > 0
          ? `No prazo — tempo médio: ${formatDurationHours(delivery.avgDeliveryHours!)}`
          : "Ainda sem entregas suficientes",
      icon: Gauge,
    },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <LiveRefresh />
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

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <Card key={card.label}>
                <CardContent className="flex flex-col gap-2">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <card.icon className="size-3.5" aria-hidden="true" />
                    {card.label}
                  </span>
                  <strong className="font-display text-2xl font-bold tracking-tight">
                    {card.value}
                  </strong>
                  <span className="text-xs text-muted-foreground">{card.hint}</span>
                </CardContent>
              </Card>
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

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Desempenho</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Saldo ao longo do tempo</CardTitle>
                  {balanceDeltaCents !== null ? (
                    <TrendBadge
                      delta={balanceDeltaCents}
                      label="no período"
                      formattedAbs={formatCents(Math.abs(balanceDeltaCents))}
                    />
                  ) : null}
                </CardHeader>
                <CardContent>
                  <BalanceTrendChart data={balanceHistory} />
                </CardContent>
              </Card>
              <SalesPerformanceCard
                data={salesTimeline}
                hasAnySale={stats.salesCount > 0}
                hasProducts={stats.products > 0}
                storeSlug={application.storeSlug}
              />
            </div>
          </section>

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

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Personalizar loja</CardTitle>
              {application.storeSlug ? (
                <Button
                  render={<Link href={`/loja/${application.storeSlug}`} target="_blank" />}
                  variant="outline"
                  size="sm"
                >
                  <ExternalLink className="size-3.5" />
                  Ver loja pública
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <BannerUpload bannerUrl={profileRow?.bannerUrl ?? null} />
            </CardContent>
          </Card>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
