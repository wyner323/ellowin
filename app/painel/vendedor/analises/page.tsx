import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Download, Users } from "lucide-react"
import { eq } from "drizzle-orm"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { BarList } from "@/components/seller/analytics/bar-list"
import { ChartCard, LegendKey } from "@/components/seller/analytics/chart-card"
import { Funnel } from "@/components/seller/analytics/funnel"
import { HealthMeter } from "@/components/seller/analytics/health-meter"
import { KpiCard } from "@/components/seller/analytics/kpi-card"
import { PeriodSelector } from "@/components/seller/analytics/period-selector"
import { TimeSeriesChart, type SeriesPoint } from "@/components/seller/analytics/time-series-chart"
import { formatValue } from "@/components/seller/analytics/format"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPercent, parsePeriod } from "@/lib/analytics-math"
import { longDate, shortDate } from "@/lib/chart-geometry"
import { db } from "@/lib/db"
import { sellerApplication } from "@/lib/db/schema"
import { getSellerUnansweredQuestionsCount } from "@/lib/marketplace"
import { formatCents } from "@/lib/money"
import { getSellerAnalytics } from "@/lib/seller-analytics"
import { getSession } from "@/lib/session"
import { formatDurationHours } from "@/lib/time"

export const metadata: Metadata = {
  title: "Análises de vendas",
  description: "Receita, pedidos, visitas e conversão da sua loja, com comparação com o período anterior.",
}

const CATEGORY_LABEL: Record<string, string> = {
  contas: "Contas de jogos",
  moedas: "Moedas e gold",
  "gift-cards": "Gift cards",
  boosting: "Boosting e serviços",
}

export default async function AnalisesPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const sp = await searchParams
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const [application] = await db.select({ status: sellerApplication.status }).from(sellerApplication).where(eq(sellerApplication.userId, session.user.id)).limit(1)
  if (!application || application.status !== "aprovado") redirect("/vender")

  const period = parsePeriod(sp.periodo)
  const [a, pendingQuestions] = await Promise.all([getSellerAnalytics(session.user.id, period), getSellerUnansweredQuestionsCount(session.user.id)])

  const hasAnything = a.current.orders > 0 || a.previous.orders > 0 || a.products.length > 0
  const withViews = a.viewsAvailable && (a.current.views ?? 0) > 0

  const revenuePoints: SeriesPoint[] = a.series.map((p, i) => ({
    day: p.day,
    value: p.revenueCents,
    previous: a.previousSeries[i]?.revenueCents ?? null,
    previousDay: a.previousSeries[i]?.day,
  }))
  const orderPoints: SeriesPoint[] = a.series.map((p) => ({ day: p.day, value: p.orders }))
  const viewPoints: SeriesPoint[] = a.series.map((p) => ({ day: p.day, value: p.views ?? 0 }))

  const funnelStages = withViews
    ? [
        { label: "visualizações", value: a.current.views ?? 0 },
        { label: "pedidos", value: a.current.orders },
        { label: "vendas concluídas", value: a.current.concluded },
      ]
    : [
        { label: "pedidos", value: a.current.orders },
        { label: "vendas concluídas", value: a.current.concluded },
      ]

  const ops = a.operations
  const prevOps = a.previousOperations
  const pct = (r: number | null) => (r === null ? null : r * 100)

  // Liberações previstas: de hoje em diante, mais as que já passaram do dia (a varredura libera em seguida).
  const today = a.to
  const releaseRows = a.releases.slice(0, 8).map((r) => ({
    label: r.day <= today ? (r.day === today ? "Hoje" : `Atrasada desde ${shortDate(r.day)}`) : longDate(r.day),
    value: r.cents,
    hint: `${r.count} ${r.count === 1 ? "pedido" : "pedidos"}`,
  }))

  const buyers = a.buyers
  const returningShare = buyers.revenueCents > 0 ? (buyers.returningRevenueCents / buyers.revenueCents) * 100 : null

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <SellerTabs pendingQuestions={pendingQuestions} />

      <main id="conteudo" className="flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-2xl font-bold tracking-tight">Análises de vendas</h1>
              <p className="text-sm text-muted-foreground">
                {shortDate(a.from)} a {shortDate(a.to)} · comparado com os {period} dias anteriores. Venda conta no dia em que o valor é liberado.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PeriodSelector basePath="/painel/vendedor/analises" active={period} />
              <Button render={<Link href={`/painel/vendedor/vendas/exportar?periodo=${period}`} prefetch={false} />} variant="outline" size="sm">
                <Download className="size-3.5" aria-hidden="true" />
                Exportar vendas (CSV)
              </Button>
            </div>
          </header>

          {!hasAnything ? (
            <Card>
              <CardContent className="flex flex-col items-start gap-3 py-10">
                <p className="font-medium">Ainda não há vendas nem anúncios para analisar.</p>
                <p className="text-sm text-muted-foreground">Assim que você publicar e vender, os gráficos e a conversão aparecem aqui.</p>
                <Button render={<Link href="/painel/vendedor/produtos/novo" />} size="sm">
                  Criar anúncio
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <section aria-label="Indicadores do período" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <KpiCard
                  label="Receita líquida"
                  value={formatCents(a.current.revenueCents)}
                  hint={`${a.current.concluded} ${a.current.concluded === 1 ? "venda concluída" : "vendas concluídas"}`}
                  delta={a.deltas.revenue}
                  spark={a.series.map((p) => p.revenueCents)}
                />
                <KpiCard
                  label="Pedidos"
                  value={a.current.orders.toLocaleString("pt-BR")}
                  hint="criados no período"
                  delta={a.deltas.orders}
                  spark={a.series.map((p) => p.orders)}
                />
                <KpiCard
                  label="Ticket médio"
                  value={a.current.avgTicketCents === null ? "—" : formatCents(a.current.avgTicketCents)}
                  hint="líquido por venda"
                  delta={a.deltas.avgTicket}
                />
                <KpiCard
                  label="Visualizações"
                  value={a.viewsAvailable ? (a.current.views ?? 0).toLocaleString("pt-BR") : "—"}
                  hint={a.viewsAvailable ? "dos seus anúncios" : "sem dados de visitas ainda"}
                  delta={a.deltas.views}
                  spark={a.viewsAvailable ? a.series.map((p) => p.views ?? 0) : undefined}
                />
                <KpiCard
                  label="Conversão"
                  value={a.current.conversion === null ? "—" : formatPercent(a.current.conversion * 100)}
                  hint={a.current.conversion === null ? "pedidos ÷ visualizações" : `${a.current.orders} pedidos em ${(a.current.views ?? 0).toLocaleString("pt-BR")} visitas`}
                  delta={a.deltas.conversion}
                />
              </section>

              <ChartCard
                title="Receita por dia"
                subtitle="Valor líquido das vendas concluídas, depois da taxa da Ellowin"
                legend={
                  <>
                    <LegendKey color="primary" label="Este período" />
                    <LegendKey color="muted" label="Período anterior" />
                  </>
                }
                table={{
                  columns: ["Dia", "Receita", "Vendas", "Período anterior"],
                  rows: a.series.map((p, i) => [shortDate(p.day), formatCents(p.revenueCents), String(p.concluded), formatCents(a.previousSeries[i]?.revenueCents ?? 0)]),
                }}
              >
                <TimeSeriesChart
                  points={revenuePoints}
                  kind="money"
                  label="Receita"
                  summary={`Receita líquida por dia nos últimos ${period} dias, total ${formatCents(a.current.revenueCents)}`}
                />
              </ChartCard>

              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard
                  title={withViews ? "Visitas e pedidos" : "Pedidos por dia"}
                  subtitle={withViews ? "Quantas pessoas abriram seus anúncios e quantas compraram" : "Pedidos criados em cada dia"}
                  table={{
                    columns: ["Dia", "Pedidos", "Visualizações"],
                    rows: a.series.map((p) => [shortDate(p.day), String(p.orders), p.views === null ? "—" : String(p.views)]),
                  }}
                >
                  {withViews ? (
                    <div className="flex flex-col gap-4">
                      <div>
                        <p className="pb-1 text-xs font-medium text-muted-foreground">Visualizações por dia</p>
                        <TimeSeriesChart points={viewPoints} kind="count" label="Visualizações" mode="bars" summary={`Visualizações por dia, total ${formatValue(a.current.views, "count")}`} />
                      </div>
                      <div>
                        <p className="pb-1 text-xs font-medium text-muted-foreground">Pedidos por dia</p>
                        <TimeSeriesChart points={orderPoints} kind="count" label="Pedidos" mode="bars" summary={`Pedidos por dia, total ${formatValue(a.current.orders, "count")}`} />
                      </div>
                    </div>
                  ) : (
                    <TimeSeriesChart points={orderPoints} kind="count" label="Pedidos" mode="bars" summary={`Pedidos por dia, total ${formatValue(a.current.orders, "count")}`} />
                  )}
                </ChartCard>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Funil de vendas</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {withViews ? "Do primeiro olhar à venda concluída" : "Visitas aparecem aqui quando seus anúncios receberem acessos"}
                    </span>
                  </CardHeader>
                  <CardContent>
                    <Funnel stages={funnelStages} emptyText="Sem pedidos no período." />
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Receita por jogo</CardTitle>
                    <span className="text-xs text-muted-foreground">Vendas concluídas no período</span>
                  </CardHeader>
                  <CardContent>
                    <BarList
                      kind="money"
                      emptyText="Nenhuma venda concluída no período."
                      rows={a.byGame.map((r) => ({ label: r.label, value: r.value, hint: `${r.count} ${r.count === 1 ? "venda" : "vendas"}` }))}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Receita por categoria</CardTitle>
                    <span className="text-xs text-muted-foreground">Vendas concluídas no período</span>
                  </CardHeader>
                  <CardContent>
                    <BarList
                      kind="money"
                      emptyText="Nenhuma venda concluída no período."
                      rows={a.byCategory.map((r) => ({ label: CATEGORY_LABEL[r.label] ?? r.label, value: r.value, hint: `${r.count} ${r.count === 1 ? "venda" : "vendas"}` }))}
                    />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Desempenho por anúncio</CardTitle>
                  <span className="text-xs text-muted-foreground">Visitas, pedidos e conversão no período, do que mais faturou para o que menos</span>
                </CardHeader>
                <CardContent>
                  {a.products.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Você ainda não tem anúncios.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[34rem] text-left text-sm tabular-nums">
                        <thead className="bg-muted text-xs text-muted-foreground">
                          <tr>
                            <th scope="col" className="px-3 py-2 font-medium">Anúncio</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">Visitas</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">Pedidos</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">Conversão</th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">Receita</th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.products.map((p) => (
                            <tr key={p.id} className="border-t border-border">
                              <td className="max-w-64 px-3 py-2">
                                <Link href={`/painel/vendedor/produtos/${p.id}`} className="block truncate font-medium hover:text-primary" title={p.title}>
                                  {p.title}
                                </Link>
                                {p.status !== "ativo" ? <span className="text-xs text-muted-foreground">pausado</span> : null}
                              </td>
                              <td className="px-3 py-2 text-right">{p.views === null ? "—" : p.views.toLocaleString("pt-BR")}</td>
                              <td className="px-3 py-2 text-right">{p.orders}</td>
                              <td className="px-3 py-2 text-right">{p.conversion === null ? "—" : formatPercent(p.conversion * 100)}</td>
                              <td className="px-3 py-2 text-right font-medium">{formatCents(p.revenueCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Saúde da operação</CardTitle>
                    <span className="text-xs text-muted-foreground">Pesa na sua reputação e nos destaques da vitrine</span>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    <HealthMeter
                      label="Entregas no prazo"
                      value={ops.onTimePercent}
                      previous={prevOps.onTimePercent}
                      target={90}
                      goodWhen="high"
                      detail={
                        ops.deliveriesWithDeadline > 0
                          ? `${ops.deliveriesWithDeadline} entregas com prazo · média de ${formatDurationHours(ops.avgDeliveryHours ?? 0)}`
                          : "Entrega automática não entra nesta conta"
                      }
                    />
                    <HealthMeter label="Cancelamentos" value={pct(ops.cancelRate)} previous={pct(prevOps.cancelRate)} target={5} goodWhen="low" detail={`${ops.cancelled} de ${ops.orders} pedidos`} />
                    <HealthMeter label="Reembolsos" value={pct(ops.refundRate)} previous={pct(prevOps.refundRate)} target={3} goodWhen="low" detail={`${ops.refunded} de ${ops.orders} pedidos`} />
                    <HealthMeter label="Disputas abertas" value={pct(ops.disputeRate)} previous={pct(prevOps.disputeRate)} target={3} goodWhen="low" detail={`${ops.disputed} de ${ops.orders} pedidos`} />
                  </CardContent>
                </Card>

                <div className="flex flex-col gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="size-4 text-primary" aria-hidden="true" />
                        Compradores
                      </CardTitle>
                      <span className="text-xs text-muted-foreground">Quem comprou de você no período</span>
                    </CardHeader>
                    <CardContent>
                      {buyers.total === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum comprador no período.</p>
                      ) : (
                        <dl className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <dt className="text-xs text-muted-foreground">Compradores</dt>
                            <dd className="font-display text-xl font-bold tabular-nums">{buyers.total}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">Já tinham comprado antes</dt>
                            <dd className="font-display text-xl font-bold tabular-nums">
                              {buyers.returning}
                              <span className="ml-1 text-xs font-normal text-muted-foreground">({formatPercent((buyers.returning / buyers.total) * 100)})</span>
                            </dd>
                          </div>
                          <div className="col-span-2 text-xs text-muted-foreground">
                            Esses compradores trouxeram {formatPercent(returningShare)} da receita do período.
                          </div>
                        </dl>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Liberações previstas</CardTitle>
                      <span className="text-xs text-muted-foreground">Pedidos entregues que ainda esperam a confirmação do comprador; o valor é liberado sozinho no dia indicado</span>
                    </CardHeader>
                    <CardContent>
                      <BarList kind="money" showShare={false} emptyText="Nenhum pedido esperando liberação." rows={releaseRows} />
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
