"use client"

import Image from "next/image"
import { Check, Circle, ImageIcon, Zap, Clock } from "lucide-react"
import { getCategory } from "@/lib/catalog"
import { INSTANT_DELIVERY_TIME } from "@/lib/delivery"
import type { ListingCheck } from "@/lib/listing-checks"
import { formatCents, parseToCents, splitOrderAmount } from "@/lib/money"
import { cn } from "@/lib/utils"

/**
 * Prévia do anúncio como o comprador vai ver na vitrine (mesma proporção 16:9
 * da capa), atualizada a cada tecla, mais o "quanto eu recebo" — a taxa da
 * plataforma sai do preço, e o vendedor costuma só descobrir isso depois.
 */
export function ListingPreview({
  title,
  game,
  categorySlug,
  coverUrl,
  deliveryType,
  deliveryTime,
  prices,
}: {
  title: string
  game: string
  categorySlug: string
  coverUrl: string | null
  deliveryType: string
  deliveryTime: string
  /** Preços digitados (texto), um por item. */
  prices: string[]
}) {
  const cents = prices
    .map((p) => parseToCents(p))
    .filter((c): c is number => c !== null && c >= 100)
  const cheapest = cents.length ? Math.min(...cents) : null
  const net = cheapest !== null ? splitOrderAmount(cheapest).sellerNetCents : null
  const categoryName = getCategory(categorySlug)?.name
  const instant = deliveryType === "automatica"

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Prévia na vitrine
      </span>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative aspect-video w-full bg-muted">
          {coverUrl ? (
            <Image src={coverUrl} alt="" fill sizes="340px" className="object-cover" />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <ImageIcon className="size-7" aria-hidden="true" />
              <span className="text-xs">Sem foto de capa</span>
            </span>
          )}
          <span
            className={cn(
              "absolute top-3 left-3 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.7rem] font-medium backdrop-blur",
              instant ? "bg-success/90 text-success-foreground" : "bg-background/85 text-foreground",
            )}
          >
            {instant ? (
              <Zap className="size-3" aria-hidden="true" />
            ) : (
              <Clock className="size-3" aria-hidden="true" />
            )}
            {instant ? INSTANT_DELIVERY_TIME : deliveryTime}
          </span>
        </div>

        <div className="flex flex-col gap-2 p-4">
          <span className="truncate text-xs text-muted-foreground">
            {[game.trim(), categoryName].filter(Boolean).join(" · ") || "Jogo · Categoria"}
          </span>
          <p
            className={cn(
              "line-clamp-2 leading-snug font-medium text-pretty",
              !title.trim() && "text-muted-foreground",
            )}
          >
            {title.trim() || "O título do seu anúncio aparece aqui"}
          </p>
          <div className="flex items-end justify-between gap-3 pt-1">
            <div className="flex flex-col">
              <span className="text-[0.7rem] text-muted-foreground">
                {cents.length > 1 ? "a partir de" : "preço"}
              </span>
              <strong className="font-display text-xl leading-tight font-bold">
                {cheapest !== null ? formatCents(cheapest) : "R$ —"}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {net !== null ? (
          <>
            Você recebe <strong className="text-foreground">{formatCents(net)}</strong> nessa venda
            (preço menos a taxa da plataforma de {formatCents(cheapest! - net)}).
          </>
        ) : (
          <>Informe o preço de um item para ver quanto você recebe depois da taxa.</>
        )}
      </p>
    </div>
  )
}

/** Lista "antes de publicar": o que já está certo e o que ainda falta. */
export function ListingChecklist({ checks }: { checks: ListingCheck[] }) {
  const missing = checks.filter((c) => c.required && !c.ok).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Antes de publicar
        </span>
        <span
          className={cn(
            "text-xs font-medium",
            missing === 0 ? "text-success" : "text-muted-foreground",
          )}
        >
          {missing === 0 ? "Tudo pronto" : `Falta${missing === 1 ? "" : "m"} ${missing}`}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {checks.map((check) => (
          <li key={check.key} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                check.ok
                  ? "bg-success text-success-foreground"
                  : check.required
                    ? "border border-border text-transparent"
                    : "border border-dashed border-border text-transparent",
              )}
              aria-hidden="true"
            >
              {check.ok ? <Check className="size-3" /> : <Circle className="size-2" />}
            </span>
            <span className={cn(check.ok ? "text-foreground" : "text-muted-foreground")}>
              {check.label}
              <span className="sr-only">{check.ok ? " — ok" : check.required ? " — pendente" : " — opcional"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
