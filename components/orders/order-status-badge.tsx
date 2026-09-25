import {
  CheckCircle2,
  Clock,
  PackageCheck,
  ShieldAlert,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react"
import { ORDER_STATUS_LABEL } from "@/lib/orders"
import { cn } from "@/lib/utils"

export type StatusTone = "gold" | "primary" | "success" | "destructive" | "muted"

/** Ícone e tom por status: o estado se lê pela cor e pelo ícone antes do texto. */
const META: Record<string, { icon: LucideIcon; tone: StatusTone }> = {
  aguardando_entrega: { icon: Clock, tone: "gold" },
  entregue: { icon: PackageCheck, tone: "primary" },
  concluido: { icon: CheckCircle2, tone: "success" },
  em_disputa: { icon: ShieldAlert, tone: "destructive" },
  reembolsado: { icon: Undo2, tone: "muted" },
  cancelado: { icon: XCircle, tone: "muted" },
}

export function statusMeta(status: string) {
  return META[status] ?? { icon: Clock, tone: "muted" as StatusTone }
}

/** Classes por tom, compartilhadas entre a pílula, o ícone e o realce de linha. */
export const TONE = {
  gold: {
    pill: "bg-gold text-gold-foreground",
    tile: "bg-gold/15 text-gold",
    text: "text-gold",
    border: "border-gold/40",
  },
  primary: {
    pill: "bg-primary/15 text-primary",
    tile: "bg-primary/15 text-primary",
    text: "text-primary",
    border: "border-primary/40",
  },
  success: {
    pill: "bg-success/15 text-success",
    tile: "bg-success/15 text-success",
    text: "text-success",
    border: "border-success/40",
  },
  destructive: {
    pill: "bg-destructive/10 text-destructive dark:bg-destructive/20",
    tile: "bg-destructive/10 text-destructive dark:bg-destructive/20",
    text: "text-destructive",
    border: "border-destructive/40",
  },
  muted: {
    pill: "bg-muted text-muted-foreground",
    tile: "bg-muted text-muted-foreground",
    text: "text-muted-foreground",
    border: "border-border",
  },
} as const satisfies Record<StatusTone, Record<string, string>>

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
  className,
}: {
  status: string
  role?: "comprador" | "vendedor"
  className?: string
}) {
  const label =
    (role === "vendedor" ? SELLER_LABEL[status] : undefined) ??
    ORDER_STATUS_LABEL[status] ??
    status
  const { tone } = statusMeta(status)

  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit items-center rounded-full px-2 text-[0.7rem] font-medium whitespace-nowrap",
        TONE[tone].pill,
        className,
      )}
    >
      {label}
    </span>
  )
}

/** Quadrado com o ícone do status, à esquerda das linhas de pedido. */
export function OrderStatusIcon({ status, className }: { status: string; className?: string }) {
  const { icon: Icon, tone } = statusMeta(status)
  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-xl",
        TONE[tone].tile,
        className,
      )}
      aria-hidden="true"
    >
      <Icon className="size-5" />
    </span>
  )
}
