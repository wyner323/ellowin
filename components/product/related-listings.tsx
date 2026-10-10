import Link from "next/link"
import { ProductCard } from "@/components/marketplace/product-card"
import type { StorefrontCard } from "@/lib/marketplace"

function Row({
  title,
  href,
  hrefLabel,
  cards,
}: {
  title: string
  href: string | null
  hrefLabel: string
  cards: StorefrontCard[]
}) {
  if (cards.length === 0) return null
  const id = `rel-${title.replace(/\W+/g, "-").toLowerCase()}`

  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="min-w-0 text-lg font-semibold text-balance">
          {title}
        </h2>
        {href ? (
          <Link
            href={href}
            className="rounded-md py-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {hrefLabel}
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <ProductCard key={card.key} card={card} />
        ))}
      </div>
    </section>
  )
}

/** Outros anúncios do mesmo jogo/categoria e da mesma loja, no fim da página do anúncio. */
export function RelatedListings({
  sameGame,
  sameGameTitle,
  sameGameHref,
  sameSeller,
  sellerName,
  sellerHref,
}: {
  sameGame: StorefrontCard[]
  sameGameTitle: string
  sameGameHref: string
  sameSeller: StorefrontCard[]
  sellerName: string
  sellerHref: string | null
}) {
  if (sameGame.length === 0 && sameSeller.length === 0) return null

  return (
    <div className="mt-12 flex flex-col gap-10 border-t border-border pt-10">
      <Row title={sameGameTitle} href={sameGameHref} hrefLabel="Ver todos" cards={sameGame} />
      <Row
        title={`Mais anúncios de ${sellerName}`}
        href={sellerHref}
        hrefLabel="Ver a loja"
        cards={sameSeller}
      />
    </div>
  )
}
