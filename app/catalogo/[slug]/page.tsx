import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ChevronRight } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { ListingFilterBar } from '@/components/marketplace/listing-filter-bar'
import { ListingResults } from '@/components/marketplace/listing-results'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { categories, getCategory } from '@/lib/catalog'
import { categoryCardInfo } from '@/lib/home-stats'
import { activeFilterCount, parseListingFilters } from '@/lib/listing-filters'
import { getCategoryStats } from '@/lib/market-stats'
import { searchListings } from '@/lib/marketplace'
import { parsePage } from '@/lib/pagination'
import { formatCents } from '@/lib/money'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const category = getCategory(slug)
  if (!category) return { title: 'Catálogo não encontrado — Ellowin' }
  return {
    title: `${category.name} — Ellowin`,
    description: category.description,
    // Filtros e ?pagina= não geram páginas novas para indexar.
    alternates: { canonical: `/catalogo/${slug}` },
  }
}

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const category = getCategory(slug)
  if (!category) notFound()

  const sp = await searchParams
  const filters = parseListingFilters(sp)

  // Filtros, ordem e paginação rodam no banco. Os anúncios fixos só completam a
  // vitrine sem filtro e ficam marcados como demonstração.
  const [result, categoryStats] = await Promise.all([
    searchListings({ categorySlug: slug }, filters, parsePage(sp.pagina)),
    getCategoryStats(),
  ])
  const info = categoryCardInfo(categoryStats[slug])
  const isEmpty =
    result.realTotal === 0 && result.demoTotal === 0 && activeFilterCount(filters) === 0

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="conteudo" className="flex-1">
        <section className="border-b border-border bg-accent/40">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center">
            <div className="flex flex-1 flex-col gap-3">
              <nav
                aria-label="Você está aqui"
                className="flex items-center gap-1 text-xs text-muted-foreground"
              >
                <Link href="/" className="hover:text-primary">
                  Início
                </Link>
                <ChevronRight className="size-3" aria-hidden="true" />
                <span className="text-foreground">{category.name}</span>
              </nav>
              <h1 className="text-3xl font-bold text-balance">{category.name}</h1>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground text-pretty">
                {category.description}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="secondary">{info.countLabel}</Badge>
                {info.fromCents !== null ? (
                  <Badge variant="outline">a partir de {formatCents(info.fromCents)}</Badge>
                ) : null}
              </div>
            </div>
            <div className="relative aspect-[4/3] w-full max-w-64 shrink-0 overflow-hidden rounded-xl border border-border">
              <Image
                src={category.image || '/placeholder.svg'}
                alt={`Ilustração do catálogo de ${category.name}`}
                fill
                sizes="256px"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-10">
          <div className="flex flex-wrap items-center gap-2 pb-6">
            {categories.map((item) => (
              <Button
                key={item.slug}
                render={<Link href={`/catalogo/${item.slug}`} />}
                size="sm"
                variant={item.slug === slug ? 'default' : 'outline'}
              >
                {item.name}
              </Button>
            ))}
          </div>

          {isEmpty ? (
            <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhum anúncio nesta categoria ainda.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              <ListingFilterBar basePath={`/catalogo/${slug}`} filters={filters} />
              <ListingResults result={result} filters={filters} basePath={`/catalogo/${slug}`} />
            </div>
          )}

          <div className="mt-10 flex flex-col items-start gap-3 rounded-xl border border-border bg-muted/40 p-6">
            <h2 className="text-lg font-semibold">
              Quer anunciar em {category.name.toLowerCase()}?
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Conclua o cadastro de vendedor com CPF válido e email confirmado
              para publicar seu primeiro anúncio.
            </p>
            <Button render={<Link href="/vender" />}>
              Cadastrar como vendedor
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
