import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { eq } from "drizzle-orm"
import { ChevronRight, Sparkles } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { GameIcon } from "@/components/games/game-icon"
import { GameSeoSection } from "@/components/games/game-seo-section"
import { ListingFilterBar } from "@/components/marketplace/listing-filter-bar"
import { ListingResults } from "@/components/marketplace/listing-results"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { db } from "@/lib/db"
import { sellerApplication } from "@/lib/db/schema"
import { attributeFieldsForSlug } from "@/lib/game-attributes"
import { activeFilterCount, parseListingFilters } from "@/lib/listing-filters"
import { categoryCardInfo, sellerCountLabel } from "@/lib/home-stats"
import { getGameStats } from "@/lib/market-stats"
import { searchListings } from "@/lib/marketplace"
import { formatCents } from "@/lib/money"
import { parsePage } from "@/lib/pagination"
import { getGameSeo } from "@/lib/game-seo"
import { findGameBySlug } from "@/lib/product-catalog"
import { getSession } from "@/lib/session"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const game = findGameBySlug(slug)
  if (!game) return { title: "Jogo não encontrado — Ellowin" }
  return {
    title: `${game.name} — Ellowin`,
    description:
      getGameSeo(slug)?.metaDescription ??
      `Contas, moedas, itens e serviços de ${game.name} na Ellowin.`,
    alternates: { canonical: `/jogos/${slug}` },
  }
}

export default async function JogoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const game = findGameBySlug(slug)
  if (!game) notFound()

  const sp = await searchParams
  const attributeFields = attributeFieldsForSlug(slug)
  const filters = parseListingFilters(sp, attributeFields)
  const [result, session, gameStats] = await Promise.all([
    searchListings({ gameSlug: slug }, filters, parsePage(sp.pagina)),
    getSession(),
    getGameStats(slug),
  ])
  const gameInfo = categoryCardInfo(gameStats ?? undefined)
  const sellers = sellerCountLabel(gameStats?.sellerCount)
  const isEmpty = result.realTotal === 0 && activeFilterCount(filters) === 0
  const seo = getGameSeo(slug)

  let sellHref = "/vender"
  if (session?.user) {
    const [application] = await db
      .select({ status: sellerApplication.status })
      .from(sellerApplication)
      .where(eq(sellerApplication.userId, session.user.id))
      .limit(1)

    if (application?.status === "aprovado") {
      sellHref = `/painel/vendedor/produtos/novo?jogo=${encodeURIComponent(game.name)}`
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="conteudo" className="flex-1">
        <section className="border-b border-border bg-accent/40">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-10">
            <nav
              aria-label="Você está aqui"
              className="flex items-center gap-1 text-xs text-muted-foreground"
            >
              <Link href="/" className="hover:text-primary">
                Início
              </Link>
              <ChevronRight className="size-3" aria-hidden="true" />
              <Link href="/jogos" className="hover:text-primary">
                Jogos
              </Link>
              <ChevronRight className="size-3" aria-hidden="true" />
              <span className="text-foreground">{game.name}</span>
            </nav>
            <div className="flex items-center gap-3">
              <GameIcon name={game.name} slug={game.slug} size="lg" />
              <h1 className="text-3xl font-bold text-balance">{game.name}</h1>
            </div>
            {/* Números do jogo todo (não da lista filtrada), direto do banco. */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{gameInfo.countLabel}</Badge>
              {sellers ? <Badge variant="secondary">{sellers}</Badge> : null}
              {gameInfo.fromCents !== null ? (
                <Badge variant="outline">a partir de {formatCents(gameInfo.fromCents)}</Badge>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-10">
          {!isEmpty ? (
            <div className="flex flex-col gap-5">
              <ListingFilterBar
                basePath={`/jogos/${slug}`}
                filters={filters}
                attributeFields={attributeFields}
              />
              <ListingResults result={result} filters={filters} basePath={`/jogos/${slug}`} />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border p-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-6" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold">
                  Ninguém vende {game.name} na Ellowin ainda
                </h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Seja o primeiro vendedor a anunciar aqui e apareça
                  para quem está procurando por {game.name}.
                </p>
              </div>
              <Button render={<Link href={sellHref} />}>Quero vender {game.name}</Button>
            </div>
          )}
        </section>

        {seo ? <GameSeoSection game={game.name} seo={seo} /> : null}
      </main>
      <SiteFooter />
    </div>
  )
}
