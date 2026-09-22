import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm"
import { db } from "@/lib/db"
import { dispute, order } from "@/lib/db/schema"
import { refundEscrow, releaseEscrowToSeller, withTransaction } from "@/lib/wallet"

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
    // Uma disputa com problema (ex.: custódia já baixada por outra rota) não
    // pode travar a varredura inteira — as telas de disputa/moderação chamam
    // isso a cada carregamento, então um erro aqui não pode virar 500 pra
    // quem só está tentando ver a fila.
    try {
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
    } catch (error) {
      console.error(`[sla] Falha ao varrer a disputa #${row.id}:`, error)
    }
  }

  return processed
}

/**
 * Aplica o prazo de entrega: reembolsa automaticamente o comprador quando o
 * vendedor não confirma a entrega dentro da janela prometida no anúncio
 * (order.deliveryDueAt, congelada na compra a partir de product.deliveryTime
 * — ver lib/delivery.ts). Mesmo padrão de sweepDisputeSla(): sem cron neste
 * ambiente, isso roda ao carregar as telas de pedidos. Também repõe o
 * estoque da variante, já que a venda não se completou — mesmo
 * comportamento de cancelOrder() em app/actions/orders.ts.
 */
export async function sweepDeliveryDeadline() {
  const stale = await db
    .select({ id: order.id })
    .from(order)
    .where(
      and(
        eq(order.status, "aguardando_entrega"),
        isNotNull(order.deliveryDueAt),
        lt(order.deliveryDueAt, new Date()),
      ),
    )

  if (stale.length === 0) return 0

  let processed = 0

  for (const row of stale) {
    // Mesmo motivo do sweepDisputeSla(): um pedido com problema não pode
    // travar a varredura inteira, já que isso roda a cada carregamento de
    // tela de pedidos.
    try {
      const [ord] = await db
        .select()
        .from(order)
        .where(eq(order.id, row.id))
        .limit(1)

      if (!ord || ord.status !== "aguardando_entrega") continue

      await withTransaction(async (client) => {
        await refundEscrow(
          client,
          ord.buyerId,
          ord.amountCents,
          ord.id,
          `Reembolso automático por prazo de entrega — pedido #${ord.id}`,
        )

        // Guarda a mesma corrida do re-check acima, mas dentro da própria
        // transação: se o status mudou entre o SELECT de cima e aqui (ex.:
        // vendedor entregou ou comprador cancelou nesse intervalo), o UPDATE
        // não afeta nenhuma linha e a transação inteira desfaz o
        // refundEscrow já executado.
        const updated = await client.query(
          `UPDATE "order" SET "status" = 'reembolsado', "completedAt" = now()
            WHERE "id" = $1 AND "status" = 'aguardando_entrega'`,
          [ord.id],
        )
        if (updated.rowCount === 0) {
          throw new Error(`pedido #${ord.id} saiu de aguardando_entrega durante o reembolso`)
        }

        await client.query(
          `UPDATE "product_variant" SET "stock" = "stock" + 1 WHERE "id" = $1`,
          [ord.variantId],
        )

        await client.query(
          `INSERT INTO "order_message" ("orderId", "authorRole", "body")
           VALUES ($1, 'system', $2)`,
          [
            ord.id,
            "Prazo de entrega encerrado sem confirmação do vendedor. O valor em custódia foi devolvido ao comprador automaticamente.",
          ],
        )
      })

      processed += 1
    } catch (error) {
      console.error(`[sla] Falha ao varrer o pedido #${row.id}:`, error)
    }
  }

  return processed
}

/**
 * Libera automaticamente a custódia ao vendedor quando o pedido foi entregue
 * e o comprador nunca confirmou nem abriu disputa dentro do prazo
 * (order.autoReleaseAt, gravado na compra — ver app/actions/orders.ts). Sem
 * isso, um comprador que simplesmente some deixa o dinheiro parado na
 * custódia pra sempre, já que confirmReceipt() só roda por ação do comprador.
 * Mesmo padrão de sweepDeliveryDeadline(): sem cron neste ambiente, roda ao
 * carregar as telas de pedidos.
 */
export async function sweepAutoRelease() {
  const stale = await db
    .select({ id: order.id })
    .from(order)
    .where(
      and(
        eq(order.status, "entregue"),
        isNotNull(order.autoReleaseAt),
        lt(order.autoReleaseAt, new Date()),
      ),
    )

  if (stale.length === 0) return 0

  let processed = 0

  for (const row of stale) {
    // Mesmo motivo dos sweeps acima: um pedido com problema não pode travar
    // a varredura inteira.
    try {
      const [ord] = await db
        .select()
        .from(order)
        .where(eq(order.id, row.id))
        .limit(1)

      if (!ord || ord.status !== "entregue") continue

      await withTransaction(async (client) => {
        await releaseEscrowToSeller(client, {
          buyerId: ord.buyerId,
          sellerId: ord.sellerId,
          amountCents: ord.amountCents,
          feeCents: ord.feeCents,
          sellerNetCents: ord.sellerNetCents,
          orderId: ord.id,
          description: `${ord.productTitle} (${ord.variantLabel})`,
        })

        // Mesma trava por linha afetada dos outros sweeps: se o status mudou
        // entre o SELECT de cima e aqui, desfaz o releaseEscrowToSeller já
        // executado.
        const updated = await client.query(
          `UPDATE "order" SET "status" = 'concluido', "completedAt" = now()
            WHERE "id" = $1 AND "status" = 'entregue'`,
          [ord.id],
        )
        if (updated.rowCount === 0) {
          throw new Error(`pedido #${ord.id} saiu de entregue durante a liberação`)
        }

        await client.query(
          `UPDATE "product" SET "salesCount" = "salesCount" + 1 WHERE "id" = $1`,
          [ord.productId],
        )

        await client.query(
          `INSERT INTO "order_message" ("orderId", "authorRole", "body")
           VALUES ($1, 'system', $2)`,
          [
            ord.id,
            "Prazo de confirmação encerrado sem ação do comprador. O valor em custódia foi liberado ao vendedor automaticamente.",
          ],
        )
      })

      processed += 1
    } catch (error) {
      console.error(`[sla] Falha ao varrer o pedido #${row.id}:`, error)
    }
  }

  return processed
}
