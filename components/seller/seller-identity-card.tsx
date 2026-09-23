import Link from "next/link"
import { Plus, ShieldCheck } from "lucide-react"
import { StarRating } from "@/components/marketplace/star-rating"
import { Button } from "@/components/ui/button"
import { initialsOf } from "@/lib/utils"

export function SellerIdentityCard({
  storeName,
  level,
  rating,
  ratingCount,
  hasCertificationSeal,
}: {
  storeName: string
  level: number
  rating: number | null
  ratingCount: number
  hasCertificationSeal: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-gradient-to-br from-card to-card/60 p-6">
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-gold bg-primary font-display text-2xl font-bold text-primary-foreground">
          {initialsOf(storeName)}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-balance">
              {storeName}
            </span>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold">
              Nível {level}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <StarRating rating={rating} count={ratingCount} />
            {hasCertificationSeal ? (
              <span className="flex items-center gap-1.5 text-success">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Selo de Certificação
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <Button render={<Link href="/painel/vendedor/produtos/novo" />}>
        <Plus className="size-4" />
        Novo anúncio
      </Button>
    </div>
  )
}
