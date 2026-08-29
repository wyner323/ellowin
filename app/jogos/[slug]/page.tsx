import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { eq } from "drizzle-orm"
import { ChevronRight, Sparkles } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ProductCard } from "@/components/marketplace/product-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { db } from "@/lib/db"
import { sellerApplication } from "@/lib/db/schema"
import { getListingsByGame } from "@/lib/marketplace"
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
    description: `Contas, moedas, itens e serviços de ${game.name} na Ellowin.`,
  }
}

export default async function JogoPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const game = findGameBySlug(slug)
  if (!game) notFound()

  const [items, session] = await Promise.all([getListingsByGame(slug), getSession()])

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
      <main className="flex-1">
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
            <h1 className="text-3xl font-bold text-balance">{game.name}</h1>
            <Badge variant="secondary" className="w-fit">
              {items.length} {items.length === 1 ? "anúncio ativo" : "anúncios ativos"}
            </Badge>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-10">
          {items.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((card) => (
                <ProductCard key={card.key} card={card} />
              ))}
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
                  Seja o primeiro vendedor verificado a anunciar aqui e apareça
                  para quem está procurando por {game.name}.
                </p>
              </div>
              <Button render={<Link href={sellHref} />}>Quero vender {game.name}</Button>
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
