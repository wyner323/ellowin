import type { Metadata } from "next"
import Link from "next/link"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ListingFilterBar } from "@/components/marketplace/listing-filter-bar"
import { ListingResults } from "@/components/marketplace/listing-results"
import { categories, getCategory } from "@/lib/catalog"
import { parseListingFilters, scopeHref } from "@/lib/listing-filters"
import { getGameListingCounts, searchListings } from "@/lib/marketplace"
import { parsePage } from "@/lib/pagination"
import { findGameBySlug } from "@/lib/product-catalog"

export const metadata: Metadata = {
  title: "Busca",
  description: "Encontre contas, moedas, gift cards e serviços na Ellowin.",
  // Resultados de busca mudam a cada filtro; não há o que indexar aqui.
  robots: { index: false, follow: true },
}

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const rawQuery = Array.isArray(sp.q) ? sp.q[0] : sp.q
  const term = (rawQuery ?? "").trim().slice(0, 80)
  // Com texto digitado, a ordem padrão é por relevância; sem ele, a mais recente.
  const filters = parseListingFilters(sp, [], term ? "relevancia" : "recentes")
  // Só categorias que existem; qualquer outro valor na URL é ignorado.
  const rawCategory = Array.isArray(sp.categoria) ? sp.categoria[0] : sp.categoria
  const category = rawCategory && getCategory(rawCategory) ? rawCategory : undefined

  const [result, gameCounts] = await Promise.all([
    searchListings(
      { ...(term ? { query: term } : {}), ...(category ? { categorySlug: category } : {}) },
      filters,
      parsePage(sp.pagina),
    ),
    // Atalhos para os jogos que têm anúncio — só quando ainda não há um termo digitado.
    term ? Promise.resolve({} as Record<string, number>) : getGameListingCounts(),
  ])
  const popularGames = Object.entries(gameCounts)
    .sort((a, b) => b[1] - a[1])
    .flatMap(([slug]) => {
      const game = findGameBySlug(slug)
      return game ? [{ slug, name: game.name }] : []
    })
    .slice(0, 10)

  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {term ? `Resultados para "${term}"` : "Todos os anúncios"}
        </h1>

        {popularGames.length > 0 ? (
          <nav aria-label="Jogos com anúncios" className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Jogos com anúncios:</span>
            {popularGames.map((game) => (
              <Link
                key={game.slug}
                href={`/jogos/${game.slug}`}
                className="rounded-full border border-border bg-card px-3.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {game.name}
              </Link>
            ))}
          </nav>
        ) : null}

        <nav aria-label="Categorias" className="flex flex-wrap items-center gap-2">
          {[{ slug: undefined, name: "Todas" }, ...categories].map((item) => {
            const active = item.slug === category
            return (
              <Link
                key={item.slug ?? "todas"}
                href={scopeHref("/busca", { q: term || undefined, categoria: item.slug })}
                aria-current={active ? "true" : undefined}
                className={
                  active
                    ? "rounded-full border border-primary bg-primary px-3.5 py-2.5 text-xs font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    : "rounded-full border border-border bg-card px-3.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                }
              >
                {item.name}
              </Link>
            )
          })}
        </nav>

        <ListingFilterBar
          basePath="/busca"
          query={term || undefined}
          category={category}
          filters={filters}
        />
        <ListingResults
          result={result}
          filters={filters}
          basePath="/busca"
          query={term || undefined}
          category={category}
          gridClass="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        />
      </main>
      <SiteFooter />
    </>
  )
}
