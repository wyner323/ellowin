"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ImageIcon } from "lucide-react"
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

export function SellerProductsList({ products }: { products: SellerProduct[] }) {
  const [query, setQuery] = useState("")

  const trimmed = query.trim().toLowerCase()
  const filtered = trimmed
    ? products.filter((p) => p.title.toLowerCase().includes(trimmed))
    : products

  return (
    <div className="flex flex-col gap-4">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nome do anúncio"
        className="h-9 max-w-sm"
      />

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum anúncio encontrado para &quot;{query.trim()}&quot;.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((p) => {
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
