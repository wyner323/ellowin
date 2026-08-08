import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Package, Plus } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { StarRating } from "@/components/marketplace/star-rating"
import { ProductStatusToggle } from "@/components/seller/product-status-toggle"
import { Button } from "@/components/ui/button"
import { getSellerProducts } from "@/lib/marketplace"
import { formatCents } from "@/lib/money"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Meus anúncios",
}

export default async function MeusProdutosPage() {
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const products = await getSellerProducts(session.user.id)

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
          <div>
            <Button
              render={<Link href="/painel/vendedor" />}
              variant="ghost"
              size="sm"
              className="-ml-2"
            >
              <ArrowLeft className="size-4" />
              Painel do vendedor
            </Button>
          </div>

          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-tight">Meus anúncios</h1>
              <p className="text-sm text-muted-foreground">
                Cada anúncio pode ter vários itens com preço e estoque próprios.
              </p>
            </div>
            <Button render={<Link href="/painel/vendedor/produtos/novo" />} size="sm">
              <Plus className="size-4" />
              Novo anúncio
            </Button>
          </header>

          {products.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-10 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Package className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium">Nenhum anúncio publicado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Publique o primeiro item para começar a vender.
                </p>
              </div>
              <Button render={<Link href="/painel/vendedor/produtos/novo" />} size="sm">
                Criar anúncio
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {products.map((p) => {
                const active = p.variants.filter((v) => v.active)
                const stock = active.reduce((sum, v) => sum + v.stock, 0)
                const cheapest = active.length
                  ? Math.min(...active.map((v) => v.priceCents))
                  : null

                return (
                  <li
                    key={p.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={
                              p.status === "ativo"
                                ? "rounded-full bg-primary/15 px-2 py-0.5 text-[0.7rem] font-medium text-primary"
                                : "rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground"
                            }
                          >
                            {p.status === "ativo" ? "Ativo" : "Pausado"}
                          </span>
                          <StarRating rating={p.rating} count={p.ratingCount} />
                        </div>
                        <Link
                          href={`/produtos/${p.slug}`}
                          className="truncate font-medium hover:text-primary"
                        >
                          {p.title}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {active.length} {active.length === 1 ? "item" : "itens"} ·{" "}
                          {stock} em estoque · {p.salesCount} vendas
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {cheapest !== null ? (
                          <strong className="font-display text-lg font-bold">
                            {formatCents(cheapest)}
                          </strong>
                        ) : null}
                        <Button
                          render={<Link href={`/painel/vendedor/produtos/${p.id}`} />}
                          variant="outline"
                          size="sm"
                        >
                          Editar
                        </Button>
                        <ProductStatusToggle productId={p.id} status={p.status} />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
