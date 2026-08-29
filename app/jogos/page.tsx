import type { Metadata } from "next"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { GamesIndex } from "@/components/games/games-index"
import { GAMES } from "@/lib/product-catalog"
import { getGameListingCounts } from "@/lib/marketplace"

export const metadata: Metadata = {
  title: "Jogos — Ellowin",
  description: "Encontre contas, moedas, itens e serviços pelo jogo que você joga.",
}

export default async function JogosPage() {
  const counts = await getGameListingCounts()

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-border bg-accent/40">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-10">
            <h1 className="text-3xl font-bold text-balance">Jogos</h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground text-pretty">
              Navegue pelos anúncios da Ellowin por jogo — contas, moedas, itens e
              boosting, tudo organizado por título.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-10">
          <GamesIndex games={GAMES} counts={counts} />
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
