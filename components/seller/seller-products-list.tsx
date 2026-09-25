"use client"

import Link from "next/link"
import Image from "next/image"
import { ImageIcon, Search } from "lucide-react"
import { StarRating } from "@/components/marketplace/star-rating"
import { ProductStatusToggle } from "@/components/seller/product-status-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatCents } from "@/lib/money"

type SellerProduct = {
  id: number
  title: string
  slug: string
  status: string
  coverUrl: string | null
  rating: number | null
  ratingCount: number
  salesCount: number
  variants: { active: boolean; stock: number; priceCents: number }[]
}

/**
 * A busca é um formulário GET (?q=): o servidor filtra e pagina, então achar
 * um anúncio funciona mesmo que ele esteja numa página que não foi carregada.
 */
export function SellerProductsList({
  products,
  query,
}: {
  products: SellerProduct[]
  query: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <form method="get" action="/painel/vendedor/produtos" role="search" className="flex max-w-sm gap-2">
        <Input
          name="q"
          defaultValue={query}
          placeholder="Buscar por nome do anúncio"
          className="h-9"
          maxLength={100}
        />
        <Button type="submit" variant="outline" size="sm" className="h-9">
          <Search className="size-4" aria-hidden="true" />
          Buscar
        </Button>
      </form>

      {products.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum anúncio encontrado para &quot;{query}&quot;.
        </p>
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
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                      {p.coverUrl ? (
                        <Image
                          src={p.coverUrl || "/placeholder.svg"}
                          alt=""
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="size-5" aria-hidden="true" />
                        </span>
                      )}
                    </div>

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
  )
}
