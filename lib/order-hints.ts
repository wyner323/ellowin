/**
 * Linha de contexto de um pedido nas listas: o prazo que importa AGORA para
 * quem está olhando (entregar até…, confirmar até…). Puro, com `now` injetável.
 */

export type OrderHint = { text: string; urgent: boolean }

const DAY_MS = 24 * 60 * 60 * 1000

/** "12/09 14:30" no horário de Brasília — o servidor roda em UTC. */
export function formatDeadline(date: Date): string {
  // formatToParts em vez de toLocaleString: o separador entre data e hora
  // ("25/09, 12:30" vs "25/09 12:30") muda entre versões do ICU.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  return `${parts.day}/${parts.month} ${parts.hour}:${parts.minute}`
}

export function orderHint({
  status,
  role,
  deliveryDueAt,
  autoReleaseAt,
  now = new Date(),
}: {
  status: string
  role: "comprador" | "vendedor"
  deliveryDueAt: Date | null
  autoReleaseAt: Date | null
  now?: Date
}): OrderHint | null {
  if (status === "aguardando_entrega") {
    if (deliveryDueAt) {
      const late = deliveryDueAt.getTime() < now.getTime()
      if (role === "vendedor")
        return late
          ? { text: "Prazo de entrega vencido — entregue agora", urgent: true }
          : { text: `Entregar até ${formatDeadline(deliveryDueAt)}`, urgent: false }
      return late
        ? { text: "Prazo de entrega vencido", urgent: true }
        : { text: `Entrega prometida até ${formatDeadline(deliveryDueAt)}`, urgent: false }
    }
    return {
      text: role === "vendedor" ? "Aguardando você entregar" : "Aguardando o vendedor entregar",
      urgent: false,
    }
  }

  if (status === "entregue") {
    const left = autoReleaseAt ? autoReleaseAt.getTime() - now.getTime() : null
    const days = left === null ? null : Math.max(0, Math.ceil(left / DAY_MS))
    const suffix =
      days === null
        ? ""
        : days === 0
          ? " · libera automaticamente hoje"
          : ` · libera automaticamente em ${days} ${days === 1 ? "dia" : "dias"}`

    return role === "comprador"
      ? { text: `Confirme o recebimento${suffix}`, urgent: days !== null && days <= 1 }
      : { text: `Aguardando o comprador confirmar${suffix}`, urgent: false }
  }

  if (status === "em_disputa") return { text: "Disputa em andamento", urgent: true }

  return null
}
