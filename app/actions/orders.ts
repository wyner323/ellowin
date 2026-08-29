"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { order, orderMessage, product } from "@/lib/db/schema"
import { getOrderMessages } from "@/lib/orders"
import { AUTO_RELEASE_DAYS, splitOrderAmount } from "@/lib/money"
import { getUserId } from "@/lib/session"
import { moveToEscrow, releaseEscrowToSeller, refundEscrow, withTransaction } from "@/lib/wallet"
import type { ActionResult } from "@/app/actions/auth"

/**
 * Compra de uma variante.
 *
 * O preço NUNCA vem do cliente: só o `variantId` é aceito e o valor é lido do
 * banco dentro da transação, com a linha travada. Isso impede tanto a
 * manipulação de preço quanto duas compras simultâneas do último item.
 */
export async function purchase(variantId: number): Promise<ActionResult & { orderId?: number }> {
  const buyerId = await getUserId()

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
      }>(
        `SELECT v."id", v."productId", v."label", v."priceCents", v."stock", v."active",
                p."title", p."sellerId", p."status", p."deliveryType"
           FROM "product_variant" v
           JOIN "product" p ON p."id" = v."productId"
          WHERE v."id" = $1
          FOR UPDATE OF v`,
        [variantId],
      )

      const variant = rows[0]
      if (!variant) throw new Error("Item não encontrado.")
      if (!variant.active || variant.status !== "ativo")
        throw new Error("Este item não está mais disponível.")
      if (variant.stock < 1) throw new Error("Item esgotado.")
      if (variant.sellerId === buyerId)
        throw new Error("Você não pode comprar o seu próprio anúncio.")

      const { amountCents, feeCents, sellerNetCents } = splitOrderAmount(variant.priceCents)

      const autoReleaseAt = new Date(
        Date.now() + AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000,
      )

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO "order"
           ("buyerId", "sellerId", "productId", "variantId", "productTitle",
            "variantLabel", "amountCents", "feeCents", "sellerNetCents",
            "status", "autoReleaseAt")
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
          autoReleaseAt,
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

    revalidatePath("/pedidos")
    revalidatePath("/carteira")

    return { ok: true, message: "Compra realizada. O valor ficou em custódia.", orderId }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível concluir a compra."
    return { ok: false, error: message }
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

  await db
    .update(order)
    .set({
      status: "entregue",
      deliveryPayload: input.payload.trim(),
      deliveredAt: new Date(),
    })
    .where(eq(order.id, row.id))

  revalidatePath("/painel/vendedor/vendas")
  revalidatePath(`/pedidos/${row.id}`)
  revalidatePath("/pedidos")

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

  await withTransaction(async (client) => {
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
      `UPDATE "order" SET "status" = 'concluido', "completedAt" = now() WHERE "id" = $1`,
      [row.id],
    )

    await client.query(
      `UPDATE "product" SET "salesCount" = "salesCount" + 1 WHERE "id" = $1`,
      [row.productId],
    )
  })

  revalidatePath(`/pedidos/${row.id}`)
  revalidatePath("/pedidos")
  revalidatePath("/carteira")
  revalidatePath("/painel/vendedor")

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

  await withTransaction(async (client) => {
    await refundEscrow(
      client,
      row.buyerId,
      row.amountCents,
      row.id,
      `Cancelamento do pedido #${row.id}`,
    )

    await client.query(
      `UPDATE "order" SET "status" = 'cancelado', "completedAt" = now() WHERE "id" = $1`,
      [row.id],
    )

    await client.query(
      `UPDATE "product_variant" SET "stock" = "stock" + 1 WHERE "id" = $1`,
      [row.variantId],
    )
  })

  revalidatePath(`/pedidos/${row.id}`)
  revalidatePath("/pedidos")
  revalidatePath("/carteira")
  revalidatePath("/painel/vendedor/vendas")

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
