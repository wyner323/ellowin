import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export type SellerTip = {
  id: string
  icon: LucideIcon
  title: string
  description: string
  href?: string
  cta?: string
}

/**
 * Painel de recomendações geradas a partir dos dados reais da loja (ver
 * buildSellerTips em app/painel/vendedor/page.tsx) — nunca genérico fixo,
 * só aparece o que se aplica a este vendedor agora.
 */
export function SellerTips({ tips }: { tips: SellerTip[] }) {
  if (tips.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sua loja está com os fundamentos em dia — continue assim para manter o ritmo de vendas.
      </p>
    )
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {tips.map((tip) => (
        <li
          key={tip.id}
          className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <tip.icon className="size-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-sm font-medium">{tip.title}</p>
            <p className="text-xs text-muted-foreground">{tip.description}</p>
            {tip.href && tip.cta ? (
              <Button
                render={<Link href={tip.href} />}
                variant="link"
                size="sm"
                className="h-auto w-fit p-0 text-xs"
              >
                {tip.cta}
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
