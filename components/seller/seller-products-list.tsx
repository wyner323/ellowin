import Link from "next/link"
import Image from "next/image"
import { ImageIcon, Search } from "lucide-react"
import { StarRating } from "@/components/marketplace/star-rating"
import { ProductStatusToggle } from "@/components/seller/product-status-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getCategory } from "@/lib/catalog"
import { formatCents } from "@/lib/money"
import { cn } from "@/lib/utils"

type SellerProduct = {
  id: number
  title: string
  slug: string
  status: string
  game: string | null
  categorySlug: string
  coverUrl: string | null
  rating: number | null
  ratingCount: number
  salesCount: number
  variants: { active: boolean; stock: number; priceCents: number }[]
}

/** Campo de busca: formulário GET (?q=), o servidor filtra e pagina — sem JS no cliente. */
export function ProductSearchForm({ query, status }: { query: string; status?: string }) {
  return (
    <form
      method="get"
      action="/painel/vendedor/produtos"
      role="search"
      className="flex w-full gap-2 sm:max-w-sm"
    >
      {status ? <input type="hidden" name="status" value={status} /> : null}
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
  )
}

/**
 * Anúncios em cards com a foto de capa em destaque (é o que o comprador vê na
 * vitrine), estado, faixa de preço, estoque e desempenho. Anúncio ativo sem
 * estoque ganha um aviso: continua na vitrine mas ninguém consegue comprar.
 */
export function SellerProductsList({
  products,
  query,
}: {
  products: SellerProduct[]
  query: string
}) {
  if (products.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {query ? (
          <>Nenhum anúncio encontrado para &quot;{query}&quot;.</>
        ) : (
          <>Nenhum anúncio nesse filtro.</>
        )}
      </p>
    )
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {products.map((p) => {
        const active = p.variants.filter((v) => v.active)
        const stock = active.reduce((sum, v) => sum + v.stock, 0)
        const cheapest = active.length ? Math.min(...active.map((v) => v.priceCents)) : null
        const isActive = p.status === "ativo"
        const noStock = isActive && stock === 0
        const categoryName = getCategory(p.categorySlug)?.name

        return (
          <li
            key={p.id}
            className={cn(
              "flex flex-col overflow-hidden rounded-2xl border bg-card",
              noStock ? "border-gold/40" : "border-border",
              !isActive && "opacity-80",
            )}
          >
            <div className="relative aspect-video w-full bg-muted">
              {p.coverUrl ? (
                <Image
                  src={p.coverUrl}
                  alt=""
                  fill
                  sizes="(min-width: 640px) 400px, 100vw"
                  className={cn("object-cover", !isActive && "grayscale")}
                />
              ) : (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="size-8" aria-hidden="true" />
                </span>
              )}
              <div className="absolute top-3 left-3 flex gap-1.5">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[0.7rem] font-medium backdrop-blur",
                    isActive
                      ? "bg-success/90 text-success-foreground"
                      : "bg-background/85 text-muted-foreground",
                  )}
                >
                  {isActive ? "Ativo" : "Pausado"}
                </span>
                {noStock ? (
                  <span className="rounded-full bg-gold px-2.5 py-0.5 text-[0.7rem] font-medium text-gold-foreground">
                    Sem estoque
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex flex-col gap-1">
                <Link
                  href={`/produtos/${p.slug}`}
                  className="line-clamp-2 leading-snug font-medium text-pretty hover:text-primary"
                >
                  {p.title}
                </Link>
                <span className="truncate text-xs text-muted-foreground">
                  {[p.game, categoryName].filter(Boolean).join(" · ") || "Sem categoria"}
                </span>
              </div>

              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-[0.7rem] text-muted-foreground">
                    {active.length > 1 ? "a partir de" : "preço"}
                  </span>
                  <strong className="font-display text-xl leading-tight font-bold">
                    {cheapest !== null ? formatCents(cheapest) : "—"}
                  </strong>
                </div>
                <StarRating rating={p.rating} count={p.ratingCount} />
              </div>

              <dl className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                <div>
                  <dt className="text-[0.7rem] text-muted-foreground">
                    {active.length === 1 ? "Item" : "Itens"}
                  </dt>
                  <dd className="text-sm font-semibold tabular-nums">{active.length}</dd>
                </div>
                <div>
                  <dt className="text-[0.7rem] text-muted-foreground">Em estoque</dt>
                  <dd className={cn("text-sm font-semibold tabular-nums", noStock && "text-gold")}>
                    {stock}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.7rem] text-muted-foreground">Vendas</dt>
                  <dd className="text-sm font-semibold tabular-nums">{p.salesCount}</dd>
                </div>
              </dl>

              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
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
  )
}
