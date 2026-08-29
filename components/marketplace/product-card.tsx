import Link from "next/link"
import Image from "next/image"
import { BadgeCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { StarRating } from "@/components/marketplace/star-rating"
import type { StorefrontCard } from "@/lib/marketplace"
import { formatCents } from "@/lib/money"

/**
 * Card único para a vitrine.
 *
 * Anúncios reais viram link para a página do produto; os de demonstração
 * ficam estáticos e marcados como tal, para ninguém tentar comprar algo que
 * não existe no banco. A capa é otimizada pelo Next (AVIF/WebP responsivo).
 */
export function ProductCard({ card }: { card: StorefrontCard }) {
  const cover = (
    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
      <Image
        src={card.imageUrl || "/placeholder.svg"}
        alt={card.title}
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
        className="object-cover transition-transform duration-500 group-hover:scale-110"
      />
    </div>
  )

  const body = (
    <div className="flex flex-1 flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className="text-xs">
          {card.game ?? "Digital"}
        </Badge>
        {card.source === "demo" ? (
          <span className="text-xs text-muted-foreground">demonstração</span>
        ) : (
          <StarRating rating={card.seller.rating} />
        )}
      </div>

      <h3 className="mt-3 text-sm leading-snug font-medium text-pretty">
        {card.title}
      </h3>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <BadgeCheck className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate">
          {card.seller.name} · Nível {card.seller.level} ·{" "}
          {card.seller.sales.toLocaleString("pt-BR")} vendas
        </span>
      </p>

      <div className="mt-auto flex items-end justify-between gap-2 border-t border-border pt-3">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">a partir de</span>
          <span className="font-display text-lg font-bold">
            {formatCents(card.priceCents)}
          </span>
        </div>
        <span className="pb-1 text-right text-xs text-muted-foreground">
          {card.delivery}
        </span>
      </div>
    </div>
  )

  if (card.href) {
    return (
      <Link
        href={card.href}
        className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary hover:shadow-lg"
      >
        {cover}
        {body}
      </Link>
    )
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card opacity-90">
      {cover}
      {body}
    </article>
  )
}
