import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { OrderStatusBadge, OrderStatusIcon, TONE, statusMeta } from "@/components/orders/order-status-badge"
import { formatCents } from "@/lib/money"
import { orderHint } from "@/lib/order-hints"
import { cn } from "@/lib/utils"

type Row = {
  id: number
  status: string
  productTitle: string
  variantLabel: string
  createdAt: Date
  deliveryDueAt: Date | null
  autoReleaseAt: Date | null
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
})

/**
 * Linha de pedido, igual para comprador e vendedor: ícone do status, título,
 * contraparte, a dica de prazo que importa agora e o valor. Pedidos que pedem
 * ação (entregar, confirmar, disputa) ganham a borda na cor do status.
 */
export function OrderRow({
  order,
  role,
  counterparty,
  amountCents,
  amountCaption,
  badge,
}: {
  order: Row
  role: "comprador" | "vendedor"
  counterparty: string
  amountCents: number
  amountCaption?: string
  badge?: React.ReactNode
}) {
  const hint = orderHint({
    status: order.status,
    role,
    deliveryDueAt: order.deliveryDueAt,
    autoReleaseAt: order.autoReleaseAt,
  })

  // Vendedor age em "aguardando_entrega"; comprador em "entregue".
  const needsAction =
    (role === "vendedor" && order.status === "aguardando_entrega") ||
    (role === "comprador" && order.status === "entregue") ||
    order.status === "em_disputa"
  const { tone } = statusMeta(order.status)

  return (
    <Link
      href={`/pedidos/${order.id}`}
      className={cn(
        "group flex items-center gap-4 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/60",
        needsAction ? TONE[tone].border : "border-border",
      )}
    >
      <OrderStatusIcon status={order.status} />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs text-muted-foreground">
            #{order.id} · {dateFmt.format(order.createdAt)}
          </span>
          <OrderStatusBadge status={order.status} role={role} />
          {badge}
        </div>
        <span className="truncate font-medium">{order.productTitle}</span>
        <span className="truncate text-xs text-muted-foreground">
          {order.variantLabel} · {counterparty}
        </span>
        {hint ? (
          <span
            className={cn(
              "text-xs",
              hint.urgent ? "font-medium text-destructive" : "text-muted-foreground",
            )}
          >
            {hint.text}
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="flex flex-col items-end">
          <strong className="font-display text-lg font-bold tracking-tight">
            {formatCents(amountCents)}
          </strong>
          {amountCaption ? (
            <span className="text-[0.7rem] text-muted-foreground">{amountCaption}</span>
          ) : null}
        </div>
        <ChevronRight
          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
    </Link>
  )
}
