import { Wallet } from "lucide-react"
import { formatCents } from "@/lib/money"

/**
 * Card-âncora do painel: junta o saldo disponível (o número que mais importa
 * pro vendedor) com faturamento total e a receber como contexto secundário
 * dentro do mesmo card, em vez dos três competirem lado a lado com peso igual.
 */
export function SellerBalanceHero({
  saldoCents,
  faturamentoCents,
  aReceberCents,
}: {
  saldoCents: number
  faturamentoCents: number
  aReceberCents: number
}) {
  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wallet className="size-4" aria-hidden="true" />
          Saldo disponível
        </span>
        <span className="text-xs text-muted-foreground">Liberado para saque</span>
      </div>
      <strong className="font-display text-4xl font-bold tracking-tight">
        {formatCents(saldoCents)}
      </strong>
      <div className="mt-auto flex gap-6 border-t border-border pt-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Faturamento total</span>
          <span className="text-lg font-bold">{formatCents(faturamentoCents)}</span>
        </div>
        <div className="w-px bg-border" />
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">A receber (em custódia)</span>
          <span className="text-lg font-bold">{formatCents(aReceberCents)}</span>
        </div>
      </div>
    </div>
  )
}
