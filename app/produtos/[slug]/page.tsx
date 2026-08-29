import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { BadgeCheck, ChevronRight, Clock, Package, Zap } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { StarRating } from "@/components/marketplace/star-rating"
import { VariantPicker } from "@/components/product/variant-picker"
import { ProductGallery } from "@/components/product/product-gallery"
import { Badge } from "@/components/ui/badge"
import { getCategory } from "@/lib/catalog"
import { getProductBySlug } from "@/lib/marketplace"
import { getSession } from "@/lib/session"
import { getWalletSummary } from "@/lib/wallet"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const item = await getProductBySlug(slug)
  if (!item) return { title: "Anúncio não encontrado — Ellowin" }

  return {
    title: `${item.title} — Ellowin`,
    description: item.description.slice(0, 155),
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
  const walletSummary = viewerId
    ? await getWalletSummary(viewerId)
    : { availableCents: 0, heldCents: 0 }

  const category = getCategory(item.categorySlug)

  return (
    <div className="flex min-h-screen flex-col">
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

          <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
            <div className="flex flex-col gap-8">
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
              </header>

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

            <aside className="lg:sticky lg:top-28 lg:self-start">
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
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
