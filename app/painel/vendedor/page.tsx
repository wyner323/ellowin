import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  ExternalLink,
  Gauge,
  ImageIcon,
  Package,
  PackagePlus,
  Sparkles,
  Star,
  Store,
  TrendingUp,
} from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { LiveRefresh } from "@/components/live-refresh"
import { BannerUpload } from "@/components/account/banner-upload"
import {
  BalanceHistoryCard,
  SalesPerformanceCard,
  TopProductsChart,
} from "@/components/seller/dashboard-charts"
import { ReceivablesBreakdown } from "@/components/seller/receivables-breakdown"
import { SellerActionItems, type SellerActionItem } from "@/components/seller/seller-action-items"
import { SellerBalanceHero } from "@/components/seller/seller-balance-hero"
import { SellerIdentityCard } from "@/components/seller/seller-identity-card"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { SellerTips, type SellerTip } from "@/components/seller/seller-tips"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { sellerApplication, user } from "@/lib/db/schema"
import {
  getSellerAccountFlagSummary,
  getSellerDeliveryStats,
  getSellerStats,
  getSellerUnansweredQuestionsCount,
} from "@/lib/marketplace"
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

  const [
    stats,
    orders,
    wallet,
    walletEntries,
    delivery,
    disputes,
    [profileRow],
    pendingQuestions,
    accountFlags,
  ] = await Promise.all([
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
    getSellerAccountFlagSummary(session.user.id),
  ])

  const pending = orders.filter((o) => o.status === "aguardando_entrega")
  const openDisputes = disputes.filter(
    (d) => d.status === "aberta" || d.status === "em_analise",
  )

  // Ledger já vem em ordem decrescente; inverte pra desenhar o gráfico em
  // ordem cronológica, e cada linha já carrega o saldo resultante — sem
  // agregação nenhuma.
  const balanceHistory = [...walletEntries].reverse().map((e) => ({
    date: e.createdAt.toISOString(),
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

  // Estatísticas secundárias, em chips compactos — o saldo disponível e o
  // faturamento/a receber já ganharam destaque próprio em SellerBalanceHero.
  const secondaryStats = [
    {
      label: stats.salesCount === 1 ? "venda concluída" : "vendas concluídas",
      value: String(stats.salesCount),
      icon: Package,
    },
    {
      label: stats.products === 1 ? "anúncio ativo" : "anúncios ativos",
      value: String(stats.products),
      icon: Store,
    },
    {
      label:
        delivery.total > 0
          ? `no prazo · média ${formatDurationHours(delivery.avgDeliveryHours!)}`
          : "velocidade de entrega (poucos dados)",
      value: delivery.total > 0 ? `${delivery.onTimePercent}%` : "—",
      icon: Gauge,
    },
  ]

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
    ...(pending.length > 0
      ? [
          {
            id: "entregas",
            tone: "gold" as const,
            title: `${pending.length} ${pending.length === 1 ? "pedido aguardando entrega" : "pedidos aguardando entrega"}`,
            description: "Quanto antes você entrega, antes o valor entra em liberação.",
            href: "/painel/vendedor/vendas",
            cta: "Ver pedidos pendentes",
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
          <SellerIdentityCard
            storeName={application.storeName ?? "Sua loja"}
            level={application.level}
            rating={stats.rating}
            ratingCount={stats.ratingCount}
            hasCertificationSeal={accountFlags.count === 0}
          />

          <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
            <SellerBalanceHero
              saldoCents={wallet.availableCents}
              faturamentoCents={faturamentoTotalCents}
              aReceberCents={escrowCents}
            />
            <SellerActionItems items={actionItems} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {secondaryStats.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="flex flex-row items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <stat.icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="flex flex-col">
                    <strong className="font-display text-lg font-bold tracking-tight">
                      {stat.value}
                    </strong>
                    <span className="text-xs text-muted-foreground">{stat.label}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Desempenho</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <BalanceHistoryCard data={balanceHistory} />
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
