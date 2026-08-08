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

/**
 * Os rótulos padrão são escritos para o comprador ("confirme o recebimento").
 * Para o vendedor a mesma etapa significa esperar, então trocamos o texto.
 */
const SELLER_LABEL: Record<string, string> = {
  aguardando_entrega: "Entregue os dados",
  entregue: "Aguardando confirmação do comprador",
}

export function OrderStatusBadge({
  status,
  role = "comprador",
}: {
  status: string
  role?: "comprador" | "vendedor"
}) {
  const label =
    (role === "vendedor" ? SELLER_LABEL[status] : undefined) ??
    ORDER_STATUS_LABEL[status] ??
    status

  return (
    <Badge variant={VARIANT[status] ?? "outline"} className="text-[0.65rem]">
      {label}
    </Badge>
  )
}
