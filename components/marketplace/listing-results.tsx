import Link from "next/link"
import { SearchX } from "lucide-react"
import { Pagination } from "@/components/pagination"
import { ProductCard } from "@/components/marketplace/product-card"
import { Button } from "@/components/ui/button"
import { activeFilterCount, filtersToParams, type ListingFilters } from "@/lib/listing-filters"
import type { ListingPage } from "@/lib/marketplace"

/**
 * Contagem, grade de cards e paginação das listas filtradas. A contagem é só
 * de anúncios reais; os de demonstração (quando aparecem) são anunciados à parte.
 */
export function ListingResults({
  result,
  filters,
  basePath,
  query,
  gridClass = "grid gap-5 sm:grid-cols-2 lg:grid-cols-4",
}: {
  result: ListingPage
  filters: ListingFilters
  basePath: string
  query?: string
  gridClass?: string
}) {
  const { cards, realTotal, demoTotal, page, pages } = result
  const clearHref = query ? `${basePath}?q=${encodeURIComponent(query)}` : basePath
  const filtered = activeFilterCount(filters) > 0

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {realTotal} {realTotal === 1 ? "anúncio encontrado" : "anúncios encontrados"}
        {demoTotal > 0
          ? ` · mais ${demoTotal} ${demoTotal === 1 ? "exemplo" : "exemplos"} de demonstração`
          : ""}
      </p>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-14 text-center">
          <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="max-w-sm text-sm text-muted-foreground text-pretty">
            {filtered
              ? "Nenhum anúncio corresponde a esses filtros. Tente ampliar a faixa de preço ou remover algum filtro."
              : "Nenhum anúncio corresponde à sua busca."}
          </p>
          <Button
            render={<Link href={filtered ? clearHref : basePath} />}
            variant="outline"
            size="sm"
          >
            {filtered ? "Limpar filtros" : "Ver todos os anúncios"}
          </Button>
        </div>
      ) : (
        <div className={gridClass}>
          {cards.map((card) => (
            <ProductCard key={card.key} card={card} />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        pages={pages}
        total={realTotal + demoTotal}
        basePath={basePath}
        params={{ q: query, ...filtersToParams(filters) }}
      />
    </div>
  )
}
