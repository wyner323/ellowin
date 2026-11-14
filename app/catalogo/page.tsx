import type { Metadata } from "next"
import Link from "next/link"
import { CategoryArt } from "@/components/category-art"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { categories } from "@/lib/catalog"
import { categoryCardInfo } from "@/lib/home-stats"
import { getCategoryStats } from "@/lib/market-stats"
import { formatCents } from "@/lib/money"

export const metadata: Metadata = {
  title: "Todas as categorias — Ellowin",
  description: "Contas, moedas, itens, gift cards, recargas, assinaturas, keys e serviços de jogos, todos com pagamento retido até a confirmação.",
  alternates: { canonical: "/catalogo" },
}

export default async function CatalogoPage() {
  const stats = await getCategoryStats()

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="conteudo" className="flex-1">
        <section className="border-b border-border bg-accent/40">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-10">
            <h1 className="text-3xl font-bold text-balance">Todas as categorias</h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground text-pretty">
              Escolha o que você procura. Em todas elas o pagamento fica retido até você confirmar o recebimento.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-10">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => {
              const info = categoryCardInfo(stats[category.slug])
              return (
                <Link
                  key={category.slug}
                  href={`/catalogo/${category.slug}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary hover:shadow-lg"
                >
                  <div className="relative aspect-[16/9] overflow-hidden bg-accent">
                    <CategoryArt category={category} sizes="(max-width: 640px) 100vw, 33vw" imageClassName="transition-transform duration-500 group-hover:scale-105" />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <h2 className="text-base font-semibold">{category.name}</h2>
                    <p className="text-xs leading-relaxed text-muted-foreground">{category.description}</p>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <span className="text-xs text-muted-foreground">{info.countLabel}</span>
                      {info.fromCents !== null ? (
                        <span className="text-xs font-semibold text-gold-text">a partir de {formatCents(info.fromCents)}</span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
