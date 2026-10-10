import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ListingFilterBar } from "@/components/marketplace/listing-filter-bar"
import { ListingResults } from "@/components/marketplace/listing-results"
import { parseListingFilters } from "@/lib/listing-filters"
import { searchListings } from "@/lib/marketplace"
import { parsePage } from "@/lib/pagination"

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
  const filters = parseListingFilters(sp)

  const result = await searchListings(
    term ? { query: term } : {},
    filters,
    parsePage(sp.pagina),
  )

  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {term ? `Resultados para "${term}"` : "Todos os anúncios"}
        </h1>

        <ListingFilterBar basePath="/busca" query={term || undefined} filters={filters} />
        <ListingResults
          result={result}
          filters={filters}
          basePath="/busca"
          query={term || undefined}
          gridClass="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        />
      </main>
      <SiteFooter />
    </>
  )
}
