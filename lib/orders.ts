import { aliasedTable, and, asc, desc, eq, inArray, or } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  dispute,
  disputeMessage,
  order,
  product,
  review,
  sellerApplication,
  user,
} from "@/lib/db/schema"

/**
 * Leitura de pedidos e disputas.
 *
 * Toda função recebe quem está olhando: comprador e vendedor só veem os
 * próprios pedidos, e a moderação vê tudo. O filtro fica aqui para nenhuma tela
 * esquecer de aplicá-lo.
 */

const buyer = aliasedTable(user, "buyer")
const seller = aliasedTable(user, "seller")

export const ORDER_STATUS_LABEL: Record<string, string> = {
  aguardando_entrega: "Aguardando entrega",
  entregue: "Entregue — confirme o recebimento",
  concluido: "Concluído",
  em_disputa: "Em disputa",
  reembolsado: "Reembolsado",
  cancelado: "Cancelado",
}

export const DISPUTE_STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  em_analise: "Em análise",
  resolvida_comprador: "Resolvida a favor do comprador",
  resolvida_vendedor: "Resolvida a favor do vendedor",
  cancelada: "Cancelada",
}

const orderColumns = {
  id: order.id,
  buyerId: order.buyerId,
  sellerId: order.sellerId,
  productId: order.productId,
  variantId: order.variantId,
  productTitle: order.productTitle,
  variantLabel: order.variantLabel,
  amountCents: order.amountCents,
  feeCents: order.feeCents,
  sellerNetCents: order.sellerNetCents,
  status: order.status,
  deliveryPayload: order.deliveryPayload,
  deliveredAt: order.deliveredAt,
  autoReleaseAt: order.autoReleaseAt,
  completedAt: order.completedAt,
  createdAt: order.createdAt,
}

export async function getBuyerOrders(userId: string) {
  const rows = await db
    .select({
      ...orderColumns,
      sellerName: seller.name,
      storeName: sellerApplication.storeName,
      productSlug: product.slug,
    })
    .from(order)
    .leftJoin(seller, eq(seller.id, order.sellerId))
    .leftJoin(sellerApplication, eq(sellerApplication.userId, order.sellerId))
    .leftJoin(product, eq(product.id, order.productId))
    .where(eq(order.buyerId, userId))
    .orderBy(desc(order.createdAt))

  return withFlags(rows)
}

export async function getSellerOrders(userId: string) {
  const rows = await db
    .select({
      ...orderColumns,
      buyerName: buyer.name,
      productSlug: product.slug,
    })
    .from(order)
    .leftJoin(buyer, eq(buyer.id, order.buyerId))
    .leftJoin(product, eq(product.id, order.productId))
    .where(eq(order.sellerId, userId))
    .orderBy(desc(order.createdAt))

  return withFlags(rows)
}

/** Anexa "tem avaliação" e "tem disputa" numa consulta só, evitando N+1. */
async function withFlags<T extends { id: number }>(rows: T[]) {
  if (rows.length === 0) return rows.map((r) => ({ ...r, reviewed: false, disputeId: null as number | null, disputeStatus: null as string | null }))

  const ids = rows.map((r) => r.id)

  const reviews = await db
    .select({ orderId: review.orderId })
    .from(review)
    .where(inArray(review.orderId, ids))

  const disputes = await db
    .select({ id: dispute.id, orderId: dispute.orderId, status: dispute.status })
    .from(dispute)
    .where(inArray(dispute.orderId, ids))

  return rows.map((r) => {
    const d = disputes.find((x) => x.orderId === r.id)
    return {
      ...r,
      reviewed: reviews.some((x) => x.orderId === r.id),
      disputeId: d?.id ?? null,
      disputeStatus: d?.status ?? null,
    }
  })
}

export type OrderDetail = Awaited<ReturnType<typeof getOrderDetail>>

/**
 * Pedido completo com contraparte, avaliação e disputa.
 * Devolve `null` se o visitante não for comprador, vendedor nem moderação.
 */
export async function getOrderDetail(
  orderId: number,
  viewerId: string,
  isStaff = false,
) {
  const [row] = await db
    .select({
      ...orderColumns,
      buyerName: buyer.name,
      buyerEmail: buyer.email,
      sellerName: seller.name,
      sellerEmail: seller.email,
      storeName: sellerApplication.storeName,
      productSlug: product.slug,
    })
    .from(order)
    .leftJoin(buyer, eq(buyer.id, order.buyerId))
    .leftJoin(seller, eq(seller.id, order.sellerId))
    .leftJoin(sellerApplication, eq(sellerApplication.userId, order.sellerId))
    .leftJoin(product, eq(product.id, order.productId))
    .where(eq(order.id, orderId))
    .limit(1)

  if (!row) return null

  const isBuyer = row.buyerId === viewerId
  const isSeller = row.sellerId === viewerId
  if (!isBuyer && !isSeller && !isStaff) return null

  const [reviewRow] = await db
    .select()
    .from(review)
    .where(eq(review.orderId, orderId))
    .limit(1)

  const [disputeRow] = await db
    .select()
    .from(dispute)
    .where(eq(dispute.orderId, orderId))
    .limit(1)

  return {
    ...row,
    viewer: { isBuyer, isSeller, isStaff },
    review: reviewRow ?? null,
    dispute: disputeRow ?? null,
  }
}

/**
 * Histórico da conversa de uma disputa.
 *
 * `includeInternal` só é verdadeiro para a moderação: notas internas nunca vão
 * para o comprador ou o vendedor.
 */
export async function getDisputeMessages(disputeId: number, includeInternal: boolean) {
  const conditions = [eq(disputeMessage.disputeId, disputeId)]
  if (!includeInternal) conditions.push(eq(disputeMessage.internal, false))

  return db
    .select({
      id: disputeMessage.id,
      authorId: disputeMessage.authorId,
      authorRole: disputeMessage.authorRole,
      body: disputeMessage.body,
      internal: disputeMessage.internal,
      createdAt: disputeMessage.createdAt,
      authorName: user.name,
    })
    .from(disputeMessage)
    .leftJoin(user, eq(user.id, disputeMessage.authorId))
    .where(and(...conditions))
    .orderBy(asc(disputeMessage.createdAt))
}

export async function getDisputeByOrder(orderId: number) {
  const [row] = await db
    .select()
    .from(dispute)
    .where(eq(dispute.orderId, orderId))
    .limit(1)

  return row ?? null
}

/** Fila de disputas da moderação, com dados do pedido e das partes. */
export async function getDisputeQueue(statusFilter?: string[]) {
  const conditions = statusFilter?.length
    ? [inArray(dispute.status, statusFilter)]
    : []

  return db
    .select({
      id: dispute.id,
      orderId: dispute.orderId,
      reason: dispute.reason,
      status: dispute.status,
      createdAt: dispute.createdAt,
      firstContactDueAt: dispute.firstContactDueAt,
      sellerResponseDueAt: dispute.sellerResponseDueAt,
      resolutionDueAt: dispute.resolutionDueAt,
      sellerFirstResponseAt: dispute.sellerFirstResponseAt,
      moderatorId: dispute.moderatorId,
      amountCents: order.amountCents,
      productTitle: order.productTitle,
      variantLabel: order.variantLabel,
      orderStatus: order.status,
      buyerName: buyer.name,
      sellerName: seller.name,
    })
    .from(dispute)
    .leftJoin(order, eq(order.id, dispute.orderId))
    .leftJoin(buyer, eq(buyer.id, order.buyerId))
    .leftJoin(seller, eq(seller.id, order.sellerId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(dispute.resolutionDueAt))
}

export async function getDisputeDetail(disputeId: number) {
  const [row] = await db
    .select({
      id: dispute.id,
      orderId: dispute.orderId,
      openedBy: dispute.openedBy,
      reason: dispute.reason,
      description: dispute.description,
      status: dispute.status,
      firstContactDueAt: dispute.firstContactDueAt,
      sellerResponseDueAt: dispute.sellerResponseDueAt,
      resolutionDueAt: dispute.resolutionDueAt,
      sellerFirstResponseAt: dispute.sellerFirstResponseAt,
      moderatorId: dispute.moderatorId,
      resolution: dispute.resolution,
      resolvedAt: dispute.resolvedAt,
      createdAt: dispute.createdAt,
    })
    .from(dispute)
    .where(eq(dispute.id, disputeId))
    .limit(1)

  return row ?? null
}

/** Disputas em que o usuário é parte (comprador ou vendedor). */
export async function getMyDisputes(userId: string) {
  return db
    .select({
      id: dispute.id,
      orderId: dispute.orderId,
      status: dispute.status,
      reason: dispute.reason,
      resolutionDueAt: dispute.resolutionDueAt,
      productTitle: order.productTitle,
      amountCents: order.amountCents,
      isBuyer: order.buyerId,
    })
    .from(dispute)
    .innerJoin(order, eq(order.id, dispute.orderId))
    .where(or(eq(order.buyerId, userId), eq(order.sellerId, userId)))
    .orderBy(desc(dispute.createdAt))
}
