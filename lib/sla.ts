/**
 * SLA de disputas, conforme as regras acordadas:
 *
 * - Suporte da Ellowin faz o primeiro contato em até 24h úteis.
 * - Vendedor tem 48h úteis para resolver com o cliente.
 * - Resolução total em até 48h úteis (24h de contato + 24h de resolução).
 * - Trava: se o vendedor não responder até o prazo, o comprador é reembolsado
 *   automaticamente. Sem essa trava o prazo seria intenção, não regra.
 */

export const FIRST_CONTACT_HOURS = 24
export const SELLER_RESPONSE_HOURS = 48
export const RESOLUTION_HOURS = 48

const MS_PER_HOUR = 60 * 60 * 1000

function isBusinessDay(date: Date) {
  const day = date.getUTCDay()
  return day !== 0 && day !== 6
}

/**
 * Soma horas úteis (segunda a sexta) a uma data.
 *
 * Avança de hora em hora e só conta as que caem em dia útil, então um prazo
 * aberto na sexta à noite não vence no domingo.
 */
export function addBusinessHours(from: Date, hours: number) {
  const cursor = new Date(from.getTime())
  let remaining = hours

  while (remaining > 0) {
    cursor.setTime(cursor.getTime() + MS_PER_HOUR)
    if (isBusinessDay(cursor)) remaining -= 1
  }

  return cursor
}

/** Os três prazos de uma disputa recém-aberta. */
export function disputeDeadlines(openedAt: Date) {
  return {
    firstContactDueAt: addBusinessHours(openedAt, FIRST_CONTACT_HOURS),
    sellerResponseDueAt: addBusinessHours(openedAt, SELLER_RESPONSE_HOURS),
    resolutionDueAt: addBusinessHours(openedAt, RESOLUTION_HOURS),
  }
}

export type SlaState = "no_prazo" | "atencao" | "atrasado" | "encerrado"

export function slaState(d: {
  status: string
  resolutionDueAt: Date
}): SlaState {
  if (d.status.startsWith("resolvida") || d.status === "cancelada") return "encerrado"

  const remainingMs = d.resolutionDueAt.getTime() - Date.now()
  if (remainingMs < 0) return "atrasado"
  if (remainingMs < 12 * MS_PER_HOUR) return "atencao"
  return "no_prazo"
}

export function formatDeadline(date: Date) {
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/* As varreduras (sweepDisputeSla, sweepDeliveryDeadline, sweepAutoRelease) moraram
 * aqui antes; agora ficam em lib/sla-sweeps.ts, que puxa db/lib/wallet.ts/lib/notify.ts.
 * Motivo: este arquivo é importado por um Client Component
 * (components/disputes/sla-panel.tsx, só pelas funções puras acima) — juntar as duas
 * coisas no mesmo módulo levava toda essa cadeia (incluindo o `after()` de
 * "next/server", só de servidor) para o bundle do navegador e quebrava `next build`. */
