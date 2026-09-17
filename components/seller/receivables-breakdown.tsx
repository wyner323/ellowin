import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { formatCents } from "@/lib/money"

type ReceivableBucket = { status: string; count: number; totalCents: number }

/**
 * Detalha o "a receber" do card de estatísticas por etapa do pedido — a
 * custódia fica na carteira do comprador até a liberação, então o vendedor
 * precisa ver não só o total, mas em qual etapa cada parte está parada.
 */
export function ReceivablesBreakdown({
  data,
  totalCents,
}: {
  data: ReceivableBucket[]
  totalCents: number
}) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nada em custódia no momento — o valor das suas vendas concluídas já foi liberado.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {data.map((bucket) => (
          <li
            key={bucket.status}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <OrderStatusBadge status={bucket.status} role="vendedor" />
              <span className="text-xs text-muted-foreground">
                {bucket.count} {bucket.count === 1 ? "pedido" : "pedidos"}
              </span>
            </div>
            <strong className="text-sm font-semibold tabular-nums">
              {formatCents(bucket.totalCents)}
            </strong>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
        <span className="text-muted-foreground">Total em custódia</span>
        <strong className="font-display font-bold tabular-nums">
          {formatCents(totalCents)}
        </strong>
      </div>
    </div>
  )
}
