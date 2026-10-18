"use server"

import { and, eq, sql } from "drizzle-orm"
import * as Sentry from "@sentry/nextjs"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { order, orderMessage, product } from "@/lib/db/schema"
import {
  CHAT_FULL_MESSAGE,
  CHAT_RATE_MESSAGE,
  MAX_CHAT_MESSAGES_PER_HOUR,
  MAX_CHAT_MESSAGES_PER_THREAD,
} from "@/lib/chat-limits"
import { getOrderMessages } from "@/lib/orders"
import { hoursForDeliveryTime } from "@/lib/delivery"
import { AUTO_RELEASE_DAYS, formatCents, splitOrderAmount } from "@/lib/money"
import { notifyOrder } from "@/lib/notify"
import { hitRateLimit } from "@/lib/rate-limit"
import { encryptField, isEncrypted } from "@/lib/secret-box"
import { accountBlock, getUserId } from "@/lib/session"
import {
  StateConflictError,
  moveToEscrow,
  refundEscrow,
  releaseEscrowToSeller,
  transitionOrder,
  withTransaction,
} from "@/lib/wallet"
import type { ActionResult } from "@/app/actions/auth"

/** Recusa esperada da compra: a mensagem é escrita para o comprador e pode aparecer na tela. */
class PurchaseError extends Error {}
class PriceChangedError extends PurchaseError {}


/**
 * Compra e cancelamento gratuitos seguram o estoque de qualquer anúncio (o pedido decrementa o estoque
 * e o cancelamento do comprador devolve tudo, sem taxa): sem freio, uma conta esgotava o anúncio de outro
 * vendedor em laço. Pedidos aguardando entrega por comprador, compras por hora e cancelamentos por hora têm teto.
 */
const MAX_OPEN_ORDERS_PER_BUYER = 10
const MAX_PURCHASES_PER_HOUR = 20
const MAX_BUYER_CANCELS_PER_HOUR = 10

/**
 * Compra de uma variante.
 *
 * O preço cobrado NUNCA vem do cliente: é lido do banco dentro da transação,
 * com a linha travada. Isso impede tanto a manipulação de preço quanto duas
 * compras simultâneas do último item. `expectedPriceCents` é só a confirmação
 * do preço que o comprador VIU na tela: se o vendedor reajustou o item entre a
 * página carregar e o clique, a compra é recusada em vez de cobrar mais caro.
 */
export async function purchase(
  variantId: number,
  expectedPriceCents: number,
): Promise<ActionResult & { orderId?: number }> {
  const buyerId = await getUserId()

  if (!Number.isInteger(expectedPriceCents) || expectedPriceCents < 1)
    return { ok: false, error: "Não foi possível confirmar o preço. Atualize a página." }

  const blocked = await accountBlock(buyerId, "comprar")
  if (blocked) return blocked

  if (!(await hitRateLimit(`purchase:${buyerId}`, MAX_PURCHASES_PER_HOUR, 60 * 60)))
    return { ok: false, error: "Muitas compras em pouco tempo. Tente novamente mais tarde." }

  const [open] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(order)
    .where(and(eq(order.buyerId, buyerId), eq(order.status, "aguardando_entrega")))
  if ((open?.n ?? 0) >= MAX_OPEN_ORDERS_PER_BUYER)
    return {
      ok: false,
      error: "Você já tem muitos pedidos aguardando entrega. Espere alguma entrega ou cancele um pedido antes de comprar mais.",
    }

  try {
    const orderId = await withTransaction(async (client) => {
      const { rows } = await client.query<{
        id: number
        productId: number
        label: string
        priceCents: number
        stock: number
        active: boolean
        title: string
        sellerId: string
        status: string
        deliveryType: string
        deliveryTime: string
      }>(
        `SELECT v."id", v."productId", v."label", v."priceCents", v."stock", v."active",
                p."title", p."sellerId", p."status", p."deliveryType", p."deliveryTime"
           FROM "product_variant" v
           JOIN "product" p ON p."id" = v."productId"
          WHERE v."id" = $1
          FOR UPDATE OF v`,
        [variantId],
      )

      const variant = rows[0]
      if (!variant) throw new PurchaseError("Item não encontrado.")
      if (!variant.active || variant.status !== "ativo")
        throw new PurchaseError("Este item não está mais disponível.")
      if (variant.stock < 1) throw new PurchaseError("Item esgotado.")
      if (variant.sellerId === buyerId)
        throw new PurchaseError("Você não pode comprar o seu próprio anúncio.")
      if (variant.priceCents !== expectedPriceCents)
        throw new PriceChangedError(
          `O preço deste item mudou para ${formatCents(variant.priceCents)}. Confira o novo valor e compre de novo.`,
        )

      const { amountCents, feeCents, sellerNetCents } = splitOrderAmount(variant.priceCents)

      // A liberação automática (autoReleaseAt) só começa a contar na entrega — ver markDelivered —,
      // para o comprador ter sempre os dias completos para conferir.
      const deliveryHours = hoursForDeliveryTime(variant.deliveryTime)
      const deliveryDueAt =
        deliveryHours != null ? new Date(Date.now() + deliveryHours * 60 * 60 * 1000) : null

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO "order"
           ("buyerId", "sellerId", "productId", "variantId", "productTitle",
            "variantLabel", "amountCents", "feeCents", "sellerNetCents",
            "status", "deliveryDueAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'aguardando_entrega', $10)
         RETURNING "id"`,
        [
          buyerId,
          variant.sellerId,
          variant.productId,
          variant.id,
          variant.title,
          variant.label,
          amountCents,
          feeCents,
          sellerNetCents,
          deliveryDueAt,
        ],
      )

      const newOrderId = inserted.rows[0].id

      await moveToEscrow(
        client,
        buyerId,
        amountCents,
        `Compra em custódia — ${variant.title} (${variant.label})`,
        newOrderId,
      )

      await client.query(
        `UPDATE "product_variant" SET "stock" = "stock" - 1 WHERE "id" = $1`,
        [variant.id],
      )

      return newOrderId
    })

    notifyOrder("order_created", orderId)

    revalidatePath("/pedidos")
    revalidatePath("/carteira")

    return { ok: true, message: "Compra realizada. O valor ficou em custódia.", orderId }
  } catch (error) {
    // Só as recusas esperadas chegam ao comprador com o texto original; erro do banco ou da carteira
    // (nome de tabela, constraint) vai para o Sentry e a tela recebe uma mensagem genérica.
    if (error instanceof PurchaseError || (error instanceof Error && error.message === "Saldo insuficiente")) {
      // field "price" avisa a tela pra recarregar os valores atuais.
      return { ok: false, error: error.message, ...(error instanceof PriceChangedError ? { field: "price" } : {}) }
    }
    Sentry.captureException(error)
    return { ok: false, error: "Não foi possível concluir a compra. Tente novamente." }
  }
}

/** Vendedor informa a entrega e anexa os dados (login, código, link, etc.). */
export async function markDelivered(input: {
  orderId: number
  payload: string
}): Promise<ActionResult> {
  const sellerId = await getUserId()

  const [row] = await db
    .select({ id: order.id, status: order.status })
    .from(order)
    .where(and(eq(order.id, input.orderId), eq(order.sellerId, sellerId)))
    .limit(1)

  if (!row) return { ok: false, error: "Pedido não encontrado." }
  if (row.status !== "aguardando_entrega")
    return { ok: false, error: "Este pedido não está aguardando entrega." }
  if (input.payload.trim().length < 4)
    return { ok: false, field: "payload", error: "Informe os dados da entrega." }
  if (input.payload.trim().length > 5000)
    return { ok: false, field: "payload", error: "Os dados da entrega podem ter até 5000 caracteres." }
  // "enc:v1:" é o marcador do dado cifrado (lib/secret-box.ts): texto digitado com esse início seria
  // lido como cifra e a página do pedido deixaria de abrir.
  if (isEncrypted(input.payload.trim()))
    return { ok: false, field: "payload", error: "Os dados da entrega não podem começar com enc:v1:." }

  // O status vai no WHERE: se o comprador cancelou (ou o prazo estourou) entre
  // a leitura acima e aqui, nada é atualizado e a entrega não ressuscita um
  // pedido já reembolsado.
  const deliveredAt = new Date()
  const delivered = await db
    .update(order)
    .set({
      status: "entregue",
      // Cifrado em repouso quando DELIVERY_ENCRYPTION_KEY existe (lib/secret-box.ts).
      deliveryPayload: encryptField(input.payload.trim(), `order:${row.id}`),
      deliveredAt,
      // Os dias para o comprador conferir contam da entrega, não da compra.
      autoReleaseAt: new Date(deliveredAt.getTime() + AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000),
    })
    .where(and(eq(order.id, row.id), eq(order.status, "aguardando_entrega")))
    .returning({ id: order.id })

  if (delivered.length === 0)
    return { ok: false, error: "Este pedido não está mais aguardando entrega." }

  revalidatePath("/painel/vendedor/vendas")
  revalidatePath(`/pedidos/${row.id}`)
  revalidatePath("/pedidos")

  notifyOrder("order_delivered", row.id)

  return { ok: true, message: "Entrega registrada. O comprador foi notificado." }
}

/**
 * Comprador confirma o recebimento e libera a custódia ao vendedor.
 * Aqui a taxa da plataforma é descontada e o produto ganha uma venda.
 */
export async function confirmReceipt(orderId: number): Promise<ActionResult> {
  const buyerId = await getUserId()

  const [row] = await db
    .select()
    .from(order)
    .where(and(eq(order.id, orderId), eq(order.buyerId, buyerId)))
    .limit(1)

  if (!row) return { ok: false, error: "Pedido não encontrado." }
  if (row.status !== "entregue")
    return { ok: false, error: "Só é possível confirmar um pedido já entregue." }

  try {
    await withTransaction(async (client) => {
      await transitionOrder(client, row.id, ["entregue"], "concluido", { completed: true })

      await releaseEscrowToSeller(client, {
        buyerId: row.buyerId,
        sellerId: row.sellerId,
        amountCents: row.amountCents,
        feeCents: row.feeCents,
        sellerNetCents: row.sellerNetCents,
        orderId: row.id,
        description: `${row.productTitle} (${row.variantLabel})`,
      })

      await client.query(
        `UPDATE "product" SET "salesCount" = "salesCount" + 1 WHERE "id" = $1`,
        [row.productId],
      )
    })
  } catch (error) {
    if (error instanceof StateConflictError)
      return { ok: false, error: "Este pedido já foi processado. Atualize a página." }
    throw error
  }

  revalidatePath(`/pedidos/${row.id}`)
  revalidatePath("/pedidos")
  revalidatePath("/carteira")
  revalidatePath("/painel/vendedor")

  notifyOrder("order_completed", row.id)

  return { ok: true, message: "Recebimento confirmado. Agora você pode avaliar o vendedor." }
}

/**
 * Cancelamento antes da entrega. Devolve a custódia ao comprador e repõe o
 * estoque. Comprador e vendedor podem cancelar enquanto nada foi entregue.
 */
export async function cancelOrder(orderId: number): Promise<ActionResult> {
  const userId = await getUserId()

  const [row] = await db.select().from(order).where(eq(order.id, orderId)).limit(1)

  if (!row) return { ok: false, error: "Pedido não encontrado." }
  if (row.buyerId !== userId && row.sellerId !== userId)
    return { ok: false, error: "Você não participa deste pedido." }
  if (row.status !== "aguardando_entrega")
    return { ok: false, error: "Este pedido não pode mais ser cancelado." }

  // Só o cancelamento do COMPRADOR repõe estoque sem custo para ele; o do vendedor não é o vetor.
  if (userId === row.buyerId && !(await hitRateLimit(`cancel:${userId}`, MAX_BUYER_CANCELS_PER_HOUR, 60 * 60)))
    return { ok: false, error: "Muitos cancelamentos em pouco tempo. Tente novamente mais tarde." }

  try {
    await withTransaction(async (client) => {
      await transitionOrder(client, row.id, ["aguardando_entrega"], "cancelado", {
        completed: true,
      })

      await refundEscrow(
        client,
        row.buyerId,
        row.amountCents,
        row.id,
        `Cancelamento do pedido #${row.id}`,
      )

      await client.query(
        `UPDATE "product_variant" SET "stock" = "stock" + 1 WHERE "id" = $1`,
        [row.variantId],
      )
    })
  } catch (error) {
    if (error instanceof StateConflictError)
      return { ok: false, error: "Este pedido não pode mais ser cancelado. Atualize a página." }
    throw error
  }

  revalidatePath(`/pedidos/${row.id}`)
  revalidatePath("/pedidos")
  revalidatePath("/carteira")
  revalidatePath("/painel/vendedor/vendas")

  notifyOrder("order_cancelled", row.id, {
    cancelledBy: userId === row.buyerId ? "comprador" : "vendedor",
  })

  return { ok: true, message: "Pedido cancelado e valor devolvido." }
}

/** Só comprador e vendedor do pedido participam do chat — a moderação usa o canal da disputa. */
async function resolveOrderParticipation(
  orderId: number,
): Promise<{ role: "buyer" | "seller"; orderId: number } | null> {
  const userId = await getUserId()

  const [row] = await db
    .select({ buyerId: order.buyerId, sellerId: order.sellerId })
    .from(order)
    .where(eq(order.id, orderId))
    .limit(1)

  if (!row) return null
  if (row.buyerId === userId) return { role: "buyer", orderId }
  if (row.sellerId === userId) return { role: "seller", orderId }

  return null
}

/** Nova mensagem no chat do pedido, pra combinar a entrega antes de qualquer disputa. */
export async function postOrderMessage(input: {
  orderId: number
  body: string
}): Promise<ActionResult> {
  const userId = await getUserId()
  const participation = await resolveOrderParticipation(input.orderId)
  if (!participation) return { ok: false, error: "Pedido não encontrado." }

  const body = input.body.trim()
  if (body.length < 2) return { ok: false, field: "body", error: "Escreva uma mensagem." }
  if (body.length > 2000)
    return { ok: false, field: "body", error: "Mensagem muito longa (máximo 2000 caracteres)." }

  if (!(await hitRateLimit(`order-msg:${userId}:${input.orderId}`, MAX_CHAT_MESSAGES_PER_HOUR, 60 * 60)))
    return { ok: false, error: CHAT_RATE_MESSAGE }
  const [thread] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orderMessage)
    .where(eq(orderMessage.orderId, input.orderId))
  if (thread.n >= MAX_CHAT_MESSAGES_PER_THREAD) return { ok: false, error: CHAT_FULL_MESSAGE }

  await db.insert(orderMessage).values({
    orderId: input.orderId,
    authorId: userId,
    authorRole: participation.role,
    body,
  })

  revalidatePath(`/pedidos/${input.orderId}`)

  return { ok: true }
}

/** Busca as mensagens do chat do pedido para atualização em tempo real (polling). */
export async function fetchOrderMessages(orderId: number) {
  const participation = await resolveOrderParticipation(orderId)
  if (!participation) return { ok: false as const, messages: [] }

  const messages = await getOrderMessages(orderId)
  return { ok: true as const, messages }
}

/** Usado pelo painel do vendedor para saber se ele tem anúncios publicados. */
export async function sellerHasProducts() {
  const userId = await getUserId()
  const [row] = await db
    .select({ id: product.id })
    .from(product)
    .where(eq(product.sellerId, userId))
    .limit(1)

  return Boolean(row)
}
