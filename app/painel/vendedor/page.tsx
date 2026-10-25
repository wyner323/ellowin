import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowRight, ExternalLink, Gauge, ImageIcon, PackagePlus, Sparkles, Star, TrendingUp } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { LiveRefresh } from "@/components/live-refresh"
import { BannerUpload } from "@/components/account/banner-upload"
import { BarList } from "@/components/seller/analytics/bar-list"
import { ChartCard, LegendKey } from "@/components/seller/analytics/chart-card"
import { KpiCard } from "@/components/seller/analytics/kpi-card"
import { TimeSeriesChart, type SeriesPoint } from "@/components/seller/analytics/time-series-chart"
import { MonthlyGoalCard } from "@/components/seller/monthly-goal-card"
import { ReceivablesBreakdown } from "@/components/seller/receivables-breakdown"
import { SellerActionItems, type SellerActionItem } from "@/components/seller/seller-action-items"
import { SellerBalanceHero } from "@/components/seller/seller-balance-hero"
import { SellerChecklist } from "@/components/seller/seller-checklist"
import { SellerIdentityCard } from "@/components/seller/seller-identity-card"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { SellerTips, type SellerTip } from "@/components/seller/seller-tips"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPercent } from "@/lib/analytics-math"
import { shortDate } from "@/lib/chart-geometry"
import { db } from "@/lib/db"
import { sellerApplication, user } from "@/lib/db/schema"
import {
  getSellerAccountFlagSummary,
  getSellerDeliveryStats,
  getSellerStats,
  getSellerUnansweredQuestionsCount,
} from "@/lib/marketplace"
import { formatCents } from "@/lib/money"
import { getMyOpenDisputes, getSellerOrderAggregates } from "@/lib/orders"
import { getLowStock } from "@/lib/seller-alerts"
import { buildChecklist } from "@/lib/seller-checklist"
import { getChecklistInputs } from "@/lib/seller-checklist-data"
import { getSellerAnalytics } from "@/lib/seller-analytics"
import { getMonthProgressInputs } from "@/lib/seller-goals"
import { sealState } from "@/lib/seller-seal"
import { getSession } from "@/lib/session"
import { sweepAutoRelease, sweepDeliveryDeadline } from "@/lib/sla-sweeps"
import { formatDurationHours } from "@/lib/time"
import { getDailyBalanceHistory, getWalletSummary } from "@/lib/wallet"
import { eq } from "drizzle-orm"

export const metadata: Metadata = {
  title: "Painel do vendedor",
  description: "Gerencie anúncios, vendas e repasses da sua loja na Ellowin.",
}

/** O resumo do painel olha sempre os últimos 30 dias; as outras janelas ficam em /painel/vendedor/analises. */
const SUMMARY_DAYS = 30

export default async function PainelVendedorPage() {
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const [application] = await db
    .select()
    .from(sellerApplication)
    .where(eq(sellerApplication.userId, session.user.id))
    .limit(1)

  if (!application || application.status !== "aprovado") redirect("/vender")

  // Varre antes do Promise.all abaixo: as agregações de pedidos dependem do
  // status já atualizado.
  await Promise.all([sweepDeliveryDeadline(), sweepAutoRelease()])

  const [
    stats,
    aggregates,
    analytics,
    wallet,
    balanceHistory,
    delivery,
    openDisputes,
    [profileRow],
    pendingQuestions,
    accountFlags,
    monthProgress,
    lowStock,
    checklistInputs,
  ] = await Promise.all([
    getSellerStats(session.user.id),
    getSellerOrderAggregates(session.user.id),
    getSellerAnalytics(session.user.id, SUMMARY_DAYS),
    getWalletSummary(session.user.id),
    getDailyBalanceHistory(session.user.id, 30),
    getSellerDeliveryStats(session.user.id),
    getMyOpenDisputes(session.user.id),
    db
      .select({ bannerUrl: user.bannerUrl })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1),
    getSellerUnansweredQuestionsCount(session.user.id),
    getSellerAccountFlagSummary(session.user.id),
    getMonthProgressInputs(session.user.id),
    getLowStock(session.user.id),
    getChecklistInputs(session.user.id),
  ])

  const checklist = buildChecklist(checklistInputs)
  const pendingCount = aggregates.stat("aguardando_entrega")?.count ?? 0

  // Mesmo total do card "A receber", quebrado por etapa — pra o vendedor ver em
  // qual parte do fluxo o dinheiro está parado. A custódia fica na carteira do
  // comprador até a liberação, então o valor a receber vem dos pedidos ainda
  // não concluídos, não do saldo do vendedor.
  const RECEIVABLE_STATUSES = ["aguardando_entrega", "entregue", "em_disputa"] as const
  const receivableBreakdown = RECEIVABLE_STATUSES.map((status) => ({
    status,
    count: aggregates.stat(status)?.count ?? 0,
    totalCents: aggregates.stat(status)?.totalCents ?? 0,
  })).filter((bucket) => bucket.count > 0)
  const escrowCents = receivableBreakdown.reduce((total, b) => total + b.totalCents, 0)

  // Faturamento líquido acumulado — só vendas já concluídas (repasse
  // liberado), diferente do "a receber" (ainda em custódia) e do "saldo
  // disponível" (o que sobrou depois de saques já feitos).
  const faturamentoTotalCents = aggregates.stat("concluido")?.totalCents ?? 0

  // ---- gráficos (últimos 30 dias) ----
  const revenuePoints: SeriesPoint[] = analytics.series.map((p, i) => ({
    day: p.day,
    value: p.revenueCents,
    previous: analytics.previousSeries[i]?.revenueCents ?? null,
    previousDay: analytics.previousSeries[i]?.day,
  }))
  const balancePoints: SeriesPoint[] = balanceHistory.map((p) => ({ day: p.date, value: p.balanceCents }))
  const topProducts = analytics.products
    .filter((p) => p.revenueCents > 0)
    .slice(0, 5)
    .map((p) => ({ label: p.title, value: p.revenueCents, hint: `${p.concluded} ${p.concluded === 1 ? "venda" : "vendas"}` }))

  const hasSales = stats.salesCount > 0

  // O que precisa de ação agora — disputa primeiro (mais urgente, prazo
  // corre e pode custar a venda), depois entregas pendentes. Junta num só
  // lugar em destaque o que antes ficava espalhado entre um banner à parte
  // e a lista de dicas lá embaixo.
  const actionItems: SellerActionItem[] = [
    ...(openDisputes.length > 0
      ? [
          {
            id: "disputas",
            tone: "destructive" as const,
            title: `${openDisputes.length} ${openDisputes.length === 1 ? "disputa aberta" : "disputas abertas"}`,
            description:
              "Responda em até 48h úteis — depois disso o reembolso ao comprador é automático e você perde a venda.",
            href: `/pedidos/${openDisputes[0].orderId}/disputa`,
            cta: "Ver disputa",
          },
        ]
      : []),
    ...(pendingCount > 0
      ? [
          {
            id: "entregas",
            tone: "gold" as const,
            title: `${pendingCount} ${pendingCount === 1 ? "pedido aguardando entrega" : "pedidos aguardando entrega"}`,
            description: "Quanto antes você entrega, antes o valor entra em liberação.",
            href: "/painel/vendedor/vendas",
            cta: "Ver pedidos pendentes",
          },
        ]
      : []),
    ...(lowStock.length > 0
      ? [
          {
            id: "estoque",
            tone: "gold" as const,
            title: `${lowStock.length} ${lowStock.length === 1 ? "item com estoque baixo" : "itens com estoque baixo"}`,
            description: `${lowStock
              .slice(0, 3)
              .map((i) => `${i.title}, ${i.label} (${i.stock === 0 ? "esgotado" : `${i.stock} un.`})`)
              .join("; ")}${lowStock.length > 3 ? ` e mais ${lowStock.length - 3}` : ""}. Item esgotado não vende e some das buscas.`,
            href: "/painel/vendedor/produtos",
            cta: "Repor estoque",
          },
        ]
      : []),
  ]

  // Recomendações geradas a partir do estado real da loja — só entra na
  // lista o que de fato se aplica a este vendedor agora, e mostramos no
  // máximo 4 pra não virar uma parede de avisos. Disputas e entregas
  // pendentes não entram mais aqui — já têm destaque próprio em
  // SellerActionItems.
  const tipCandidates: Array<SellerTip & { show: boolean }> = [
    {
      id: "velocidade",
      show: delivery.total >= 3 && delivery.onTimePercent !== null && delivery.onTimePercent < 90,
      icon: Gauge,
      title: "Melhore sua velocidade de entrega",
      description: `Só ${delivery.onTimePercent}% das suas entregas saem no prazo prometido. Vendedores rápidos aparecem com destaque e recebem mais confiança dos compradores.`,
    },
    {
      id: "conversao",
      show:
        analytics.viewsAvailable &&
        (analytics.current.views ?? 0) >= 50 &&
        analytics.current.conversion !== null &&
        analytics.current.conversion < 0.01,
      icon: TrendingUp,
      title: "Muita visita e pouca compra",
      description:
        "Seus anúncios recebem acessos, mas poucos viram pedido. Revise preço, fotos e descrição, e veja quais anúncios convertem menos em Análises.",
      href: "/painel/vendedor/analises",
      cta: "Ver análises",
    },
    {
      id: "avaliacoes",
      show: stats.salesCount > 0 && stats.ratingCount === 0,
      icon: Star,
      title: "Peça avaliações aos compradores",
      description:
        "Sua loja ainda não tem nenhuma avaliação. A nota aparece direto na vitrine e pesa na decisão de quem está comprando.",
    },
    {
      id: "banner",
      show: !profileRow?.bannerUrl,
      icon: ImageIcon,
      title: "Personalize o banner da sua loja",
      description:
        "Lojas com identidade visual própria passam mais confiança e se destacam na página pública.",
    },
    {
      id: "poucos-anuncios",
      show: stats.products > 0 && stats.products < 3,
      icon: PackagePlus,
      title: "Publique mais anúncios",
      description:
        "Quanto mais itens ativos, mais chances de aparecer nas buscas dos jogos que você vende.",
      href: "/painel/vendedor/produtos/novo",
      cta: "Criar anúncio",
    },
    {
      id: "sem-vendas",
      show: stats.salesCount === 0 && stats.products > 0,
      icon: TrendingUp,
      title: "Ainda sem vendas",
      description:
        "Preços competitivos e entrega automática ajudam a converter mais rápido nos primeiros dias.",
    },
  ]
  const sellerTips: SellerTip[] = tipCandidates
    .filter((tip) => tip.show)
    .slice(0, 4)
    .map((tip) => ({
      id: tip.id,
      icon: tip.icon,
      title: tip.title,
      description: tip.description,
      href: tip.href,
      cta: tip.cta,
    }))

  return (
    <div className="flex min-h-screen flex-col">
      <LiveRefresh />
      <SiteHeader />
      <SellerTabs pendingQuestions={pendingQuestions} />

      <main id="conteudo" className="flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
          <SellerIdentityCard
            storeName={application.storeName ?? "Sua loja"}
            level={application.level}
            rating={stats.rating}
            ratingCount={stats.ratingCount}
            hasCertificationSeal={sealState({ flagCount: accountFlags.count, completedSales: accountFlags.completedSales }).kind === "certificado"}
          />

          <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
            <SellerBalanceHero
              saldoCents={wallet.availableCents}
              faturamentoCents={faturamentoTotalCents}
              aReceberCents={escrowCents}
            />
            <SellerActionItems items={actionItems} />
          </div>

          <SellerChecklist checklist={checklist} />

          <section aria-labelledby="resumo-30d" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="resumo-30d" className="text-lg font-semibold">
                  Últimos {SUMMARY_DAYS} dias
                </h2>
                <p className="text-xs text-muted-foreground">
                  {shortDate(analytics.from)} a {shortDate(analytics.to)}, comparado com os {SUMMARY_DAYS} dias anteriores
                </p>
              </div>
              <Button render={<Link href="/painel/vendedor/analises" />} variant="ghost" size="sm">
                Ver análises completas
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                label="Receita líquida"
                value={formatCents(analytics.current.revenueCents)}
                hint={`${analytics.current.concluded} ${analytics.current.concluded === 1 ? "venda concluída" : "vendas concluídas"}`}
                delta={analytics.deltas.revenue}
                spark={analytics.series.map((p) => p.revenueCents)}
              />
              <KpiCard
                label="Pedidos"
                value={analytics.current.orders.toLocaleString("pt-BR")}
                hint="criados no período"
                delta={analytics.deltas.orders}
                spark={analytics.series.map((p) => p.orders)}
              />
              <KpiCard
                label="Conversão"
                value={analytics.current.conversion === null ? "—" : formatPercent(analytics.current.conversion * 100)}
                hint={
                  analytics.current.views === null
                    ? "sem dados de visitas ainda"
                    : `${(analytics.current.views ?? 0).toLocaleString("pt-BR")} visualizações`
                }
                delta={analytics.deltas.conversion}
              />
              <KpiCard
                label="Entregas no prazo"
                value={delivery.total > 0 ? `${delivery.onTimePercent}%` : "—"}
                hint={delivery.total > 0 ? `média de ${formatDurationHours(delivery.avgDeliveryHours!)}` : "poucos dados"}
              />
            </div>
          </section>

          {monthProgress.available ? <MonthlyGoalCard progress={monthProgress} /> : null}

          <section aria-labelledby="desempenho" className="flex flex-col gap-4">
            <h2 id="desempenho" className="sr-only">
              Desempenho
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {hasSales ? (
                <ChartCard
                  title="Receita por dia"
                  subtitle="Valor líquido das vendas concluídas"
                  legend={
                    <>
                      <LegendKey color="primary" label="Este período" />
                      <LegendKey color="muted" label="Período anterior" />
                    </>
                  }
                  table={{
                    columns: ["Dia", "Receita", "Período anterior"],
                    rows: analytics.series.map((p, i) => [shortDate(p.day), formatCents(p.revenueCents), formatCents(analytics.previousSeries[i]?.revenueCents ?? 0)]),
                  }}
                >
                  <TimeSeriesChart
                    points={revenuePoints}
                    kind="money"
                    label="Receita"
                    summary={`Receita líquida por dia nos últimos ${SUMMARY_DAYS} dias, total ${formatCents(analytics.current.revenueCents)}`}
                  />
                </ChartCard>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Receita por dia</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-start gap-3">
                    <p className="text-sm text-muted-foreground">
                      {stats.products > 0 ? "Você ainda não vendeu nada. A receita aparece aqui a cada venda concluída." : "Você ainda não tem nenhum anúncio ativo."}
                    </p>
                    <Button size="sm" render={<Link href={stats.products > 0 && application.storeSlug ? `/loja/${application.storeSlug}` : "/painel/vendedor/produtos/novo"} target={stats.products > 0 && application.storeSlug ? "_blank" : undefined} />}>
                      {stats.products > 0 ? "Ver minha loja pública" : "Publicar meu primeiro anúncio"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {balancePoints.length > 0 ? (
                <ChartCard
                  title="Saldo da carteira"
                  subtitle="Saldo disponível ao fim de cada dia"
                  table={{
                    columns: ["Dia", "Saldo"],
                    rows: balancePoints.map((p) => [shortDate(p.day), formatCents(p.value)]),
                  }}
                >
                  <TimeSeriesChart
                    points={balancePoints}
                    kind="money"
                    label="Saldo"
                    summary={`Saldo da carteira nos últimos ${balancePoints.length} dias, hoje ${formatCents(balancePoints[balancePoints.length - 1].value)}`}
                  />
                </ChartCard>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Saldo da carteira</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Ainda sem movimentações na carteira.</p>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Anúncios que mais faturaram</CardTitle>
                  <span className="text-xs text-muted-foreground">Top 5 nos últimos {SUMMARY_DAYS} dias</span>
                </CardHeader>
                <CardContent>
                  <BarList kind="money" rows={topProducts} emptyText="Assim que uma venda for concluída, o ranking por anúncio aparece aqui." />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Detalhe do &quot;a receber&quot;</CardTitle>
                  <span className="text-xs text-muted-foreground">Por etapa do pedido</span>
                </CardHeader>
                <CardContent>
                  <ReceivablesBreakdown data={receivableBreakdown} totalCents={escrowCents} />
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              Dicas para vender mais
            </h2>
            <Card>
              <CardContent>
                <SellerTips tips={sellerTips} />
              </CardContent>
            </Card>
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            <Link
              href="/painel/vendedor/produtos"
              className="flex flex-col gap-1 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
            >
              <span className="font-medium">Meus anúncios</span>
              <span className="text-sm text-muted-foreground">Editar itens, preços e estoque</span>
            </Link>

            <Link
              href="/painel/vendedor/vendas"
              className="flex flex-col gap-1 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
            >
              <span className="font-medium">
                Minhas vendas
                {pendingCount > 0 ? (
                  <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                    {pendingCount} a entregar
                  </span>
                ) : null}
              </span>
              <span className="text-sm text-muted-foreground">Registrar entregas e acompanhar repasses</span>
            </Link>

            <Link
              href="/painel/vendedor/analises"
              className="flex flex-col gap-1 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
            >
              <span className="font-medium">Análises de vendas</span>
              <span className="text-sm text-muted-foreground">Visitas, conversão e comparação de períodos</span>
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
