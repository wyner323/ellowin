import Link from "next/link"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
  BadgeCheck,
  ChevronRight,
  Clock,
  Meh,
  Package,
  ShieldAlert,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Zap,
} from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { StarRating } from "@/components/marketplace/star-rating"
import { VariantPicker } from "@/components/product/variant-picker"
import { ProductGallery } from "@/components/product/product-gallery"
import { ProductQuestions } from "@/components/product/product-questions"
import { ReportButton } from "@/components/report-button"
import { Badge } from "@/components/ui/badge"
import { accountOriginLabel, accountOriginRetainsRecoveryData } from "@/lib/account-origin"
import { getCategory } from "@/lib/catalog"
import { getProductBySlug, getProductQuestions } from "@/lib/marketplace"
import { buildProductJsonLd, serializeJsonLd } from "@/lib/product-jsonld"
import { getSession } from "@/lib/session"
import { SITE_URL } from "@/lib/site"
import { getWalletSummary } from "@/lib/wallet"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const item = await getProductBySlug(slug)
  if (!item) return { title: "Anúncio não encontrado — Ellowin" }

  const title = `${item.title} — Ellowin`
  const description = item.description.slice(0, 155)
  const image = item.images[0] ?? getCategory(item.categorySlug)?.image

  return {
    title,
    description,
    alternates: { canonical: `/produtos/${item.slug}` },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "Ellowin",
      title,
      description,
      url: `/produtos/${item.slug}`,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: { card: "summary_large_image", title, description },
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const item = await getProductBySlug(slug)
  if (!item) notFound()

  const session = await getSession()
  const viewerId = session?.user?.id ?? null
  const [walletSummary, questions] = await Promise.all([
    viewerId ? getWalletSummary(viewerId) : Promise.resolve({ availableCents: 0, heldCents: 0 }),
    getProductQuestions(item.id),
  ])

  const category = getCategory(item.categorySlug)
  const originLabel = accountOriginLabel(item.accountOrigin)
  const originRetainsRecovery = accountOriginRetainsRecoveryData(item.accountOrigin)
  const { positivas, neutras, negativas } = item.seller.reputation
  const totalSellerReviews = positivas + neutras + negativas

  const nonce = (await headers()).get("x-nonce") ?? undefined
  const productUrl = `${SITE_URL}/produtos/${item.slug}`
  const fallbackImage = `${SITE_URL}${category?.image ?? "/icon-32x32.png"}`
  const jsonLd = serializeJsonLd(buildProductJsonLd(item, productUrl, fallbackImage))

  return (
    <div className="flex min-h-screen flex-col">
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
          <nav
            aria-label="Você está aqui"
            className="flex flex-wrap items-center gap-1 pb-6 text-xs text-muted-foreground"
          >
            <Link href="/" className="hover:text-primary">
              Início
            </Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <Link
              href={`/catalogo/${item.categorySlug}`}
              className="hover:text-primary"
            >
              {category?.name ?? item.categorySlug}
            </Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span className="truncate text-foreground">{item.title}</span>
          </nav>

          {/* Abaixo de lg a ordem é galeria → resumo → compra → detalhes, para o botão de
              comprar não ficar depois de descrição, perguntas e avaliações. */}
          <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
            <div className="flex flex-col gap-8 lg:col-start-1 lg:row-start-1">
              {item.images.length > 0 ? (
                <ProductGallery images={item.images} title={item.title} />
              ) : null}

              <header className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{item.game ?? "Digital"}</Badge>
                  {item.status !== "ativo" ? (
                    <Badge variant="secondary">Anúncio pausado</Badge>
                  ) : null}
                </div>

                <h1 className="text-2xl leading-tight font-bold text-balance sm:text-3xl">
                  {item.title}
                </h1>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <BadgeCheck className="size-4 text-primary" aria-hidden="true" />
                    {item.seller.storeSlug ? (
                      <Link
                        href={`/loja/${item.seller.storeSlug}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {item.seller.name}
                      </Link>
                    ) : (
                      item.seller.name
                    )}{" "}
                    · Nível {item.seller.level}
                  </span>
                  <StarRating rating={item.rating} count={item.ratingCount} size="md" />
                  <span className="flex items-center gap-1.5">
                    <Package className="size-4" aria-hidden="true" />
                    {item.salesCount} {item.salesCount === 1 ? "venda" : "vendas"}
                  </span>
                </div>

                {totalSellerReviews > 0 ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Reputação do vendedor:</span>
                    <span className="flex items-center gap-1">
                      <ThumbsUp className="size-3.5 text-success" aria-hidden="true" />
                      {positivas} positivas
                    </span>
                    <span className="flex items-center gap-1">
                      <Meh className="size-3.5" aria-hidden="true" />
                      {neutras} neutras
                    </span>
                    <span className="flex items-center gap-1">
                      <ThumbsDown className="size-3.5 text-destructive" aria-hidden="true" />
                      {negativas} negativas
                    </span>
                  </div>
                ) : null}

                {item.seller.accountFlags.count === 0 ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                    <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                    Selo de Certificação — sem registros de conta recuperada
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge variant="secondary" className="gap-1.5">
                    {item.deliveryType === "automatica" ? (
                      <Zap className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Clock className="size-3.5" aria-hidden="true" />
                    )}
                    {item.deliveryType === "automatica"
                      ? "Entrega automática"
                      : "Entrega manual"}
                  </Badge>
                  <Badge variant="outline">{item.deliveryTime}</Badge>
                </div>

                {viewerId && viewerId !== item.seller.id ? (
                  <ReportButton target={{ type: "anuncio", productId: item.id }} label="Denunciar anúncio" />
                ) : null}

                {originLabel ? (
                  <div
                    className={
                      originRetainsRecovery
                        ? "flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                        : "flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success"
                    }
                  >
                    {originRetainsRecovery ? (
                      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    )}
                    <span>
                      <strong>Procedência:</strong> {originLabel}
                    </span>
                  </div>
                ) : null}
              </header>
            </div>

            <aside className="lg:sticky lg:top-28 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
              {item.status === "ativo" ? (
                <VariantPicker
                  variants={item.variants}
                  isAuthenticated={Boolean(viewerId)}
                  isOwnProduct={viewerId === item.seller.id}
                  availableCents={walletSummary.availableCents}
                />
              ) : (
                <p className="rounded-xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
                  Este anúncio está pausado pelo vendedor e não aceita compras
                  neste momento.
                </p>
              )}
            </aside>

            <div className="flex flex-col gap-8 lg:col-start-1 lg:row-start-2">
              <section className="flex flex-col gap-3" aria-labelledby="descricao">
                <h2 id="descricao" className="text-lg font-semibold">
                  Sobre este anúncio
                </h2>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </section>

              <ProductQuestions
                productId={item.id}
                questions={questions}
                isAuthenticated={Boolean(viewerId)}
                isOwnProduct={viewerId === item.seller.id}
              />

              <section className="flex flex-col gap-3" aria-labelledby="avaliacoes">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="avaliacoes" className="text-lg font-semibold">
                    Avaliações do anúncio
                  </h2>
                  <StarRating rating={item.rating} count={item.ratingCount} size="md" />
                </div>

                {item.reviews.length === 0 ? (
                  <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                    Este anúncio ainda não recebeu avaliações. Elas aparecem aqui
                    depois que um comprador confirma o recebimento.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {item.reviews.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium">{r.buyerName}</span>
                          <div className="flex items-center gap-3">
                            <StarRating rating={r.rating} />
                            <span className="text-xs text-muted-foreground">
                              {r.createdAt.toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                        </div>
                        {r.comment ? (
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {r.comment}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
