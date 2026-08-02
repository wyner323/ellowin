import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

/** Exibição de nota (somente leitura). O formulário de avaliação tem o seu próprio seletor. */
export function StarRating({
  rating,
  count,
  size = "sm",
  className,
}: {
  rating: number | null
  count?: number
  size?: "sm" | "md"
  className?: string
}) {
  const iconSize = size === "md" ? "size-4" : "size-3.5"

  if (rating === null) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        Sem avaliações
      </span>
    )
  }

  return (
    <span
      className={cn("flex items-center gap-1", className)}
      aria-label={`Nota ${rating.toFixed(1)} de 5${count ? `, ${count} avaliações` : ""}`}
    >
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={cn(
              iconSize,
              n <= Math.round(rating)
                ? "fill-chart-4 text-chart-4"
                : "text-muted-foreground/40",
            )}
          />
        ))}
      </span>
      <span className="text-xs font-medium">{rating.toFixed(1)}</span>
      {count !== undefined ? (
        <span className="text-xs text-muted-foreground">({count})</span>
      ) : null}
    </span>
  )
}
