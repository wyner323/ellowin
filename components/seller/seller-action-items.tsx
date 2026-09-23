import Link from "next/link"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type SellerActionItem = {
  id: string
  tone: "destructive" | "gold"
  title: string
  description: string
  href: string
  cta: string
}

/**
 * Reúne num só lugar em destaque o que o vendedor precisa fazer agora
 * (disputas abertas, entregas pendentes) — antes ficava espalhado entre um
 * banner à parte e a lista de dicas lá embaixo.
 */
export function SellerActionItems({ items }: { items: SellerActionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center gap-1.5 rounded-2xl border border-success/30 bg-success/5 p-6">
        <span className="flex items-center gap-2 text-sm font-semibold text-success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Tudo em dia
        </span>
        <p className="text-xs text-muted-foreground">Nenhuma ação pendente no momento.</p>
      </div>
    )
  }

  const hasUrgent = items.some((item) => item.tone === "destructive")

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-3 rounded-2xl border p-5",
        hasUrgent ? "border-destructive/30 bg-destructive/5" : "border-gold/30 bg-gold/5",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle
          className={cn("size-4", hasUrgent ? "text-destructive" : "text-gold")}
          aria-hidden="true"
        />
        Ações pendentes
      </span>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.description}</p>
            <Button
              render={<Link href={item.href} />}
              size="sm"
              variant={item.tone === "destructive" ? "destructive" : "outline"}
              className="w-fit"
            >
              {item.cta}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
