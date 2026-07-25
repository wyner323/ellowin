import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ChevronRight } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { ListingCard } from '@/components/home-sections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  categories,
  formatBRL,
  getCategory,
  listingsByCategory,
} from '@/lib/catalog'

export function generateStaticParams() {
  return categories.map((category) => ({ slug: category.slug }))
}

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
  }
}

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const category = getCategory(slug)
  if (!category) notFound()

  const items = listingsByCategory(slug)

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
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
                <Badge variant="secondary">
                  {category.listings.toLocaleString('pt-BR')} anúncios
                </Badge>
                <Badge variant="outline">
                  a partir de {formatBRL(category.startingAt)}
                </Badge>
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

          {items.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhum anúncio de demonstração nesta categoria ainda.
            </p>
          )}

          <div className="mt-10 flex flex-col items-start gap-3 rounded-xl border border-border bg-muted/40 p-6">
            <h2 className="text-lg font-semibold">
              Quer anunciar em {category.name.toLowerCase()}?
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Conclua o cadastro de vendedor com CPF válido e email confirmado
              para publicar seu primeiro anúncio.
            </p>
            <Button render={<Link href="/vender/cadastro" />}>
              Cadastrar como vendedor
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
