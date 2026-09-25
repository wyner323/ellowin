"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronRight } from "lucide-react"
import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ORDER_STATUS_LABEL } from "@/lib/orders"
import { formatCents } from "@/lib/money"

type SellerOrder = {
  id: number
  status: string
  productTitle: string
  variantLabel: string
  buyerName: string | null
  sellerNetCents: number
}

/**
 * O filtro de status vai para a URL (?status=) e a filtragem acontece no
 * servidor: com paginação, filtrar só a página carregada esconderia pedidos das
 * outras páginas.
 */
export function SellerOrdersList({
  orders,
  status,
}: {
  orders: SellerOrder[]
  status: string
}) {
  const router = useRouter()
  const pathname = usePathname()

  const selectItems = { todos: "Todos os status", ...ORDER_STATUS_LABEL }

  return (
    <div className="flex flex-col gap-4">
      <Select
        items={selectItems}
        value={status}
        onValueChange={(value) =>
          router.push(value && value !== "todos" ? `${pathname}?status=${value}` : pathname)
        }
      >
        <SelectTrigger className="w-fit min-w-48" id="statusFilter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(selectItems).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum pedido com esse status.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/pedidos/${o.id}`}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Pedido #{o.id}</span>
                    <OrderStatusBadge status={o.status} role="vendedor" />
                  </div>
                  <span className="truncate font-medium">{o.productTitle}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {o.variantLabel} · {o.buyerName ?? "Comprador"}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <strong className="text-lg font-bold tracking-tight">
                      {formatCents(o.sellerNetCents)}
                    </strong>
                    <span className="text-[0.7rem] text-muted-foreground">líquido</span>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
