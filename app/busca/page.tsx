import type { Metadata } from "next"
import Link from "next/link"
import { SearchX } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ListingCard } from "@/components/home-sections"
import { Button } from "@/components/ui/button"
import { listings } from "@/lib/catalog"

export const metadata: Metadata = {
  title: "Busca",
  description: "Encontre contas, moedas, gift cards e serviços na Ellowin.",
}

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = "" } = await searchParams
  const term = q.trim().toLowerCase()

  const results = term
    ? listings.filter((listing) =>
        [listing.title, listing.game, listing.seller.name]
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
    : listings

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {term ? `Resultados para "${q}"` : "Todos os anúncios"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {results.length} anúncio{results.length === 1 ? "" : "s"} encontrado
          {results.length === 1 ? "" : "s"}
        </p>

        {results.length === 0 ? (
          <div className="mt-12 flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-16 text-center">
            <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Nenhum anúncio corresponde à sua busca.
            </p>
            <Button
              render={<Link href="/busca" />}
              variant="outline"
              size="sm"
            >
              Ver todos os anúncios
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
