import { and, eq, inArray, isNull, lt } from "drizzle-orm"
import { db } from "@/lib/db"
import { dispute, order } from "@/lib/db/schema"
import { refundEscrow, withTransaction } from "@/lib/wallet"

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

/**
 * Aplica a trava de SLA: reembolsa automaticamente as disputas em que o
 * vendedor não respondeu dentro do prazo.
 *
 * Não existe cron neste ambiente, então isso é chamado ao carregar as telas de
 * disputa e de moderação. Cada reembolso automático deixa uma mensagem de
 * sistema no histórico, para o caso ficar auditável.
 */
export async function sweepDisputeSla() {
  const stale = await db
    .select({
      id: dispute.id,
      orderId: dispute.orderId,
    })
    .from(dispute)
    .where(
      and(
        inArray(dispute.status, ["aberta", "em_analise"]),
        isNull(dispute.sellerFirstResponseAt),
        lt(dispute.sellerResponseDueAt, new Date()),
      ),
    )

  if (stale.length === 0) return 0

  let processed = 0

  for (const row of stale) {
    const [ord] = await db
      .select()
      .from(order)
      .where(eq(order.id, row.orderId))
      .limit(1)

    if (!ord || ord.status !== "em_disputa") continue

    await withTransaction(async (client) => {
      await refundEscrow(
        client,
        ord.buyerId,
        ord.amountCents,
        ord.id,
        `Reembolso automático por SLA — pedido #${ord.id}`,
      )

      await client.query(
        `UPDATE "order" SET "status" = 'reembolsado', "completedAt" = now() WHERE "id" = $1`,
        [ord.id],
      )

      await client.query(
        `UPDATE "dispute"
            SET "status" = 'resolvida_comprador',
                "resolution" = $2,
                "resolvedAt" = now()
          WHERE "id" = $1`,
        [
          row.id,
          "Reembolso automático: o vendedor não respondeu dentro das 48h úteis do SLA.",
        ],
      )

      await client.query(
        `INSERT INTO "dispute_message" ("disputeId", "authorRole", "body")
         VALUES ($1, 'system', $2)`,
        [
          row.id,
          "Prazo de 48h úteis encerrado sem resposta do vendedor. O valor em custódia foi devolvido ao comprador automaticamente.",
        ],
      )
    })

    processed += 1
  }

  return processed
}
