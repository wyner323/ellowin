import { aliasedTable, and, asc, desc, eq, gte, inArray, notInArray, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { resolvePage } from "@/lib/pagination"
import {
  dispute,
  disputeMessage,
  order,
  orderMessage,
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

/** Apelido público (fallback pro nome legal) — nunca expõe o nome real. */
function publicNameCol(t: typeof user) {
  return sql<string>`coalesce(${t.displayName}, ${t.name})`
}

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
  deliveryDueAt: order.deliveryDueAt,
  autoReleaseAt: order.autoReleaseAt,
  completedAt: order.completedAt,
  createdAt: order.createdAt,
}

/**
 * Ordem das listas: o que pede ação de quem olha vem primeiro (vendedor: entregar;
 * comprador: confirmar o recebimento), depois disputas, e o resto do mais novo
 * para o mais antigo. A ordenação é toda no banco, então a paginação continua estável.
 */
const sellerPriority = sql`case ${order.status}
  when 'aguardando_entrega' then 0
  when 'em_disputa' then 1
  else 2 end`
const buyerPriority = sql`case ${order.status}
  when 'entregue' then 0
  when 'em_disputa' then 1
  when 'aguardando_entrega' then 2
  else 3 end`

/** Página de compras do usuário (mais recentes primeiro), com filtro opcional de status. */
export async function getBuyerOrdersPage(
  userId: string,
  { status, page: requestedPage }: { status?: string; page: number },
) {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(order)
    .where(
      status ? and(eq(order.buyerId, userId), eq(order.status, status)) : eq(order.buyerId, userId),
    )

  const { page, pages, offset, limit } = resolvePage(requestedPage, total)

  const rows = await db
    .select({
      ...orderColumns,
      sellerName: publicNameCol(seller),
      storeName: sellerApplication.storeName,
      productSlug: product.slug,
    })
    .from(order)
    .leftJoin(seller, eq(seller.id, order.sellerId))
    .leftJoin(sellerApplication, eq(sellerApplication.userId, order.sellerId))
    .leftJoin(product, eq(product.id, order.productId))
    .where(
      status ? and(eq(order.buyerId, userId), eq(order.status, status)) : eq(order.buyerId, userId),
    )
    .orderBy(buyerPriority, desc(order.createdAt), desc(order.id))
    .limit(limit)
    .offset(offset)

  return { orders: await withFlags(rows), total, page, pages }
}

/**
 * Resumo das compras para o topo da tela: contagem/valor por status (alimenta as
 * pílulas de filtro e os cards) e quantas compras concluídas ainda esperam avaliação.
 */
export async function getBuyerOrderSummary(userId: string) {
  const [byStatus, [reviews]] = await Promise.all([
    db
      .select({
        status: order.status,
        count: sql<number>`count(*)::int`,
        totalCents: sql<number>`coalesce(sum(${order.amountCents}), 0)::int`,
      })
      .from(order)
      .where(eq(order.buyerId, userId))
      .groupBy(order.status),
    db
      .select({ pending: sql<number>`count(*)::int` })
      .from(order)
      .where(
        and(
          eq(order.buyerId, userId),
          eq(order.status, "concluido"),
          sql`not exists (select 1 from "review" r where r."orderId" = ${order.id})`,
        ),
      ),
  ])

  const stat = (status: string) => byStatus.find((r) => r.status === status)
  const allCount = byStatus.reduce((n, r) => n + r.count, 0)

  return { byStatus, stat, allCount, pendingReviews: reviews?.pending ?? 0 }
}

/**
 * Página de vendas do vendedor, com filtro opcional de status. `allCount` e
 * `pendingCount` ignoram o filtro: alimentam o estado vazio ("nunca vendeu") e
 * o "N pedidos aguardam entrega" do cabeçalho.
 */
export async function getSellerOrdersPage(
  userId: string,
  { status, page: requestedPage }: { status?: string; page: number },
) {
  const [counts] = await db
    .select({
      allCount: sql<number>`count(*)::int`,
      pendingCount: sql<number>`(count(*) filter (where ${order.status} = 'aguardando_entrega'))::int`,
      filteredCount: status
        ? sql<number>`(count(*) filter (where ${order.status} = ${status}))::int`
        : sql<number>`count(*)::int`,
    })
    .from(order)
    .where(eq(order.sellerId, userId))

  const total = counts?.filteredCount ?? 0
  const { page, pages, offset, limit } = resolvePage(requestedPage, total)

  const rows = await db
    .select({
      ...orderColumns,
      buyerName: publicNameCol(buyer),
      productSlug: product.slug,
    })
    .from(order)
    .leftJoin(buyer, eq(buyer.id, order.buyerId))
    .leftJoin(product, eq(product.id, order.productId))
    .where(
      status
        ? and(eq(order.sellerId, userId), eq(order.status, status))
        : eq(order.sellerId, userId),
    )
    .orderBy(sellerPriority, desc(order.createdAt), desc(order.id))
    .limit(limit)
    .offset(offset)

  return {
    orders: await withFlags(rows),
    total,
    page,
    pages,
    allCount: counts?.allCount ?? 0,
    pendingCount: counts?.pendingCount ?? 0,
  }
}

/**
 * Números do painel do vendedor calculados no banco — antes o painel carregava
 * TODOS os pedidos só para somar/agrupar em JS. Datas em UTC (como `toISOString`).
 */
export async function getSellerOrderAggregates(userId: string) {
  const [byStatus, salesByDay, topProducts] = await Promise.all([
    db
      .select({
        status: order.status,
        count: sql<number>`count(*)::int`,
        totalCents: sql<number>`coalesce(sum(${order.sellerNetCents}), 0)::int`,
      })
      .from(order)
      .where(eq(order.sellerId, userId))
      .groupBy(order.status),
    db
      .select({
        day: sql<string>`to_char(${order.completedAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
        totalCents: sql<number>`coalesce(sum(${order.sellerNetCents}), 0)::int`,
      })
      .from(order)
      .where(
        and(
          eq(order.sellerId, userId),
          eq(order.status, "concluido"),
          gte(order.completedAt, sql`now() - interval '60 days'`),
        ),
      )
      .groupBy(sql`to_char(${order.completedAt}, 'YYYY-MM-DD')`),
    db
      .select({
        title: sql<string>`max(${order.productTitle})`,
        totalCents: sql<number>`coalesce(sum(${order.sellerNetCents}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(order)
      .where(and(eq(order.sellerId, userId), eq(order.status, "concluido")))
      .groupBy(order.productId)
      .orderBy(desc(sql`sum(${order.sellerNetCents})`))
      .limit(5),
  ])

  const stat = (status: string) => byStatus.find((r) => r.status === status)

  return { byStatus, stat, salesByDay, topProducts }
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
      buyerName: publicNameCol(buyer),
      buyerEmail: buyer.email,
      sellerName: publicNameCol(seller),
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

/** Histórico do chat do pedido — comprador e vendedor coordenando a entrega. */
export async function getOrderMessages(orderId: number) {
  return db
    .select({
      id: orderMessage.id,
      authorId: orderMessage.authorId,
      authorRole: orderMessage.authorRole,
      body: orderMessage.body,
      createdAt: orderMessage.createdAt,
      authorName: publicNameCol(user),
      authorImage: user.image,
    })
    .from(orderMessage)
    .leftJoin(user, eq(user.id, orderMessage.authorId))
    .where(eq(orderMessage.orderId, orderId))
    .orderBy(asc(orderMessage.createdAt))
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
      authorName: publicNameCol(user),
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
export async function getDisputeQueue(
  opts: {
    statuses?: string[]
    excludeStatuses?: string[]
    limit?: number
    offset?: number
    /** Histórico (encerradas): mais recentes primeiro. A fila em aberto segue por prazo de resolução. */
    newestFirst?: boolean
  } = {},
) {
  const conditions = []
  if (opts.statuses?.length) conditions.push(inArray(dispute.status, opts.statuses))
  if (opts.excludeStatuses?.length) conditions.push(notInArray(dispute.status, opts.excludeStatuses))

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
      buyerName: publicNameCol(buyer),
      sellerName: publicNameCol(seller),
    })
    .from(dispute)
    .leftJoin(order, eq(order.id, dispute.orderId))
    .leftJoin(buyer, eq(buyer.id, order.buyerId))
    .leftJoin(seller, eq(seller.id, order.sellerId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      ...(opts.newestFirst
        ? [desc(dispute.createdAt), desc(dispute.id)]
        : [asc(dispute.resolutionDueAt), asc(dispute.id)]),
    )
    .limit(opts.limit ?? 1000)
    .offset(opts.offset ?? 0)
}

/** Quantas disputas existem fora dos status dados (ex.: encerradas = tudo que não é aberta/em_analise). */
export async function countDisputesExcluding(excludeStatuses: string[]) {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(dispute)
    .where(notInArray(dispute.status, excludeStatuses))
  return row?.total ?? 0
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

/** Disputas ABERTAS em que o usuário é parte (comprador ou vendedor). */
export async function getMyOpenDisputes(userId: string) {
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
    .where(
      and(
        or(eq(order.buyerId, userId), eq(order.sellerId, userId)),
        inArray(dispute.status, ["aberta", "em_analise"]),
      ),
    )
    .orderBy(desc(dispute.createdAt))
    .limit(50)
}
