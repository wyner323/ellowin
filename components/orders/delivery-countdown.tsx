"use client"

import { useSyncExternalStore } from "react"
import { AlertTriangle, Clock } from "lucide-react"
import { deliveryCountdown } from "@/lib/countdown"
import { formatDeadline } from "@/lib/order-hints"
import { cn } from "@/lib/utils"

/** O relógio anda em "fatias" de 30 s: o valor só muda a cada fatia, então o React só redesenha quando vale a pena. */
const SLICE_MS = 30_000
const subscribe = (notify: () => void) => {
  const timer = setInterval(notify, SLICE_MS)
  return () => clearInterval(timer)
}
const currentSlice = () => Math.floor(Date.now() / SLICE_MS)
const serverSlice = () => null

/**
 * Contador do prazo de entrega. No servidor (e antes de hidratar) mostra só a hora limite, igual para todo mundo, para
 * a página não "piscar" com um horário diferente; depois de montar passa a mostrar quanto falta e atualiza a cada 30 s.
 * O estado vem em palavras e em ícone, nunca só cor.
 */
export function DeliveryCountdown({ dueAt }: { dueAt: string }) {
  const due = new Date(dueAt)
  const slice = useSyncExternalStore(subscribe, currentSlice, serverSlice)
  const now = slice === null ? null : slice * SLICE_MS

  if (now === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="size-4" aria-hidden="true" />
        Entregar até {formatDeadline(due)}
      </span>
    )
  }

  const countdown = deliveryCountdown(due, now)
  const Icon = countdown.state === "ok" ? Clock : AlertTriangle
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm",
        countdown.state === "ok" && "text-muted-foreground",
        countdown.state === "atencao" && "font-medium text-gold-text",
        countdown.state === "vencido" && "font-medium text-destructive",
      )}
      title={`Entregar até ${formatDeadline(due)}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {countdown.text}
    </span>
  )
}
