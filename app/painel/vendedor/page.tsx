import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  CircleDollarSign,
  ExternalLink,
  Gauge,
  ImageIcon,
  Package,
  PackagePlus,
  Plus,
  ShieldAlert,
  Sparkles,
  Star,
  Store,
  TrendingUp,
  Zap,
} from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { LiveRefresh } from "@/components/live-refresh"
import { BannerUpload } from "@/components/account/banner-upload"
import {
  BalanceTrendChart,
  SalesPerformanceCard,
  TopProductsChart,
  TrendBadge,
} from "@/components/seller/dashboard-charts"
import { ReceivablesBreakdown } from "@/components/seller/receivables-breakdown"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { SellerTips, type SellerTip } from "@/components/seller/seller-tips"
import { StarRating } from "@/components/marketplace/star-rating"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { sellerApplication, user } from "@/lib/db/schema"
import {
  getSellerDeliveryStats,
  getSellerStats,
  getSellerUnansweredQuestionsCount,
} from "@/lib/marketplace"
import { formatCents } from "@/lib/money"
import { getMyDisputes, getSellerOrders } from "@/lib/orders"
import { getSession } from "@/lib/session"
import { sweepAutoRelease, sweepDeliveryDeadline } from "@/lib/sla"
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
  await Promise.all([sweepDeliveryDeadline(), sweepAutoRelease()])

  const [stats, orders, wallet, walletEntries, delivery, disputes, [profileRow], pendingQuestions] =
    await Promise.all([
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
      getSellerUnansweredQuestionsCount(session.user.id),
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

  // Faturamento líquido acumulado — só vendas já concluídas (repasse
  // liberado), diferente do "a receber" (ainda em custódia) e do "saldo
  // disponível" (o que sobrou depois de saques já feitos).
  const faturamentoTotalCents = orders
    .filter((o) => o.status === "concluido")
    .reduce((total, o) => total + o.sellerNetCents, 0)

  // Ranking dos anúncios que mais faturaram, agrupando pelas próprias linhas
  // de pedido (productTitle já vem congelado no pedido) — sem query extra.
  const revenueByProduct = new Map<string, { title: string; totalCents: number; count: number }>()
  for (const o of orders) {
    if (o.status !== "concluido") continue
    const key = String(o.productId ?? o.productTitle)
    const bucket = revenueByProduct.get(key) ?? { title: o.productTitle, totalCents: 0, count: 0 }
    bucket.totalCents += o.sellerNetCents
    bucket.count += 1
    revenueByProduct.set(key, bucket)
  }
  const topProducts = Array.from(revenueByProduct.values())
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 5)

  // Mesmo total do card "A receber", só que quebrado por etapa — pra o
  // vendedor ver em qual parte do fluxo o dinheiro está parado.
  const RECEIVABLE_STATUSES = ["aguardando_entrega", "entregue", "em_disputa"] as const
  const receivableBreakdown = RECEIVABLE_STATUSES.map((status) => {
    const matching = orders.filter((o) => o.status === status)
    return {
      status,
      count: matching.length,
      totalCents: matching.reduce((total, o) => total + o.sellerNetCents, 0),
    }
  }).filter((bucket) => bucket.count > 0)

  const cards = [
    {
      label: "Faturamento total",
      value: formatCents(faturamentoTotalCents),
      hint: "Vendas concluídas, líquido de taxa",
      icon: CircleDollarSign,
    },
    {
      label: "A receber",
      value: formatCents(escrowCents),
      hint: "Em custódia até a confirmação",
      icon: Store,
    },
    {
      label: "Saldo disponível",
      value: formatCents(wallet.availableCents),
      hint: "Liberado para saque",
      icon: TrendingUp,
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

  // Recomendações geradas a partir do estado real da loja — só entra na
  // lista o que de fato se aplica a este vendedor agora, e mostramos no
  // máximo 4 pra não virar uma parede de avisos.
  const tipCandidates: Array<SellerTip & { show: boolean }> = [
    {
      id: "disputas",
      show: openDisputes.length > 0,
      icon: ShieldAlert,
      title: "Responda as disputas abertas",
      description:
        "Depois de 48h úteis sem resposta, o reembolso ao comprador é automático e você perde a venda.",
      href: openDisputes.length > 0 ? `/pedidos/${openDisputes[0].orderId}/disputa` : undefined,
      cta: "Ver disputa",
    },
    {
      id: "entregas-pendentes",
      show: pending.length > 0,
      icon: Zap,
      title: "Entregue os pedidos pendentes",
      description: `${pending.length} ${pending.length === 1 ? "pedido está" : "pedidos estão"} aguardando os dados de entrega — quanto antes você entrega, antes o valor entra em liberação.`,
      href: "/painel/vendedor/vendas",
      cta: "Ver pedidos pendentes",
    },
    {
      id: "velocidade",
      show: delivery.total >= 3 && delivery.onTimePercent !== null && delivery.onTimePercent < 90,
      icon: Gauge,
      title: "Melhore sua velocidade de entrega",
      description: `Só ${delivery.onTimePercent}% das suas entregas saem no prazo prometido. Vendedores rápidos aparecem com destaque e recebem mais confiança dos compradores.`,
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

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Faturamento por anúncio</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    Top 5 em vendas concluídas
                  </span>
                </CardHeader>
                <CardContent>
                  <TopProductsChart data={topProducts} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Detalhe do &quot;a receber&quot;</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    Por etapa do pedido
                  </span>
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
