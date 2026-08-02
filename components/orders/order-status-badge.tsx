import { Badge } from "@/components/ui/badge"
import { ORDER_STATUS_LABEL } from "@/lib/orders"

/** Cor por status para o comprador entender o estado sem ler o texto todo. */
const VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  aguardando_entrega: "outline",
  entregue: "default",
  concluido: "secondary",
  em_disputa: "destructive",
  reembolsado: "secondary",
  cancelado: "outline",
}

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={VARIANT[status] ?? "outline"} className="text-[0.65rem]">
      {ORDER_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}
