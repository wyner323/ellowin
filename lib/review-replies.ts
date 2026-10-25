import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { isUndefinedTable } from "@/lib/db-errors"
import { product, review, reviewReply, user } from "@/lib/db/schema"
import { resolvePage } from "@/lib/pagination"
import { publicNameCol } from "@/lib/public-name"

/**
 * Respostas públicas do vendedor às avaliações. A tabela `review_reply` é de uma migração recente: todo leitor aqui
 * trata a tabela inexistente como "sem respostas" (nunca derruba a página da vitrine por causa dela).
 */

export type ReviewReplyView = { body: string; updatedAt: Date }

/** Respostas das avaliações dadas (por id da avaliação). Sem a tabela, devolve vazio. */
export async function getRepliesByReview(reviewIds: number[]): Promise<Map<number, ReviewReplyView>> {
  const out = new Map<number, ReviewReplyView>()
  if (reviewIds.length === 0) return out
  try {
    const rows = await db
      .select({ reviewId: reviewReply.reviewId, body: reviewReply.body, updatedAt: reviewReply.updatedAt })
      .from(reviewReply)
      .where(inArray(reviewReply.reviewId, reviewIds))
    for (const r of rows) out.set(r.reviewId, { body: r.body, updatedAt: r.updatedAt })
  } catch (error) {
    if (!isUndefinedTable(error)) throw error
  }
  return out
}

/** Anexa `reply` (ou nulo) a cada avaliação de uma lista. */
export async function withReplies<T extends { id: number }>(reviews: T[]) {
  const replies = await getRepliesByReview(reviews.map((r) => r.id))
  return reviews.map((r) => ({ ...r, reply: replies.get(r.id) ?? null }))
}

/** Avaliações recebidas que o vendedor ainda não respondeu (zero se a tabela ainda não existe). */
export async function countUnansweredReviews(sellerId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(review)
      .where(and(eq(review.sellerId, sellerId), sql`not exists (select 1 from "review_reply" rr where rr."reviewId" = ${review.id})`))
    return row?.n ?? 0
  } catch (error) {
    if (isUndefinedTable(error)) return 0
    throw error
  }
}

export type SellerReviewFilter = "todas" | "sem-resposta"

export function parseReviewFilter(value: string | undefined): SellerReviewFilter {
  return value === "sem-resposta" ? "sem-resposta" : "todas"
}

/** Avaliações recebidas pelo vendedor, mais novas primeiro, com a resposta de cada uma. */
export async function getSellerReviewsPage(
  sellerId: string,
  { filter, page: requestedPage }: { filter: SellerReviewFilter; page: number },
) {
  const query = async (onlyUnanswered: boolean) => {
    const where = and(
      eq(review.sellerId, sellerId),
      onlyUnanswered ? sql`not exists (select 1 from "review_reply" rr where rr."reviewId" = ${review.id})` : undefined,
    )
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(review).where(where)
    const { page, pages, offset, limit } = resolvePage(requestedPage, total)
    const rows = await db
      .select({
        id: review.id,
        orderId: review.orderId,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        productTitle: product.title,
        buyerName: publicNameCol(user),
      })
      .from(review)
      .innerJoin(product, eq(product.id, review.productId))
      .leftJoin(user, eq(user.id, review.buyerId))
      .where(where)
      .orderBy(desc(review.createdAt), desc(review.id))
      .limit(limit)
      .offset(offset)
    return { rows, filtered: total, page, pages }
  }

  let repliesAvailable = true
  let result: Awaited<ReturnType<typeof query>>
  try {
    result = await query(filter === "sem-resposta")
  } catch (error) {
    if (!isUndefinedTable(error)) throw error
    repliesAvailable = false
    result = await query(false)
  }

  const [replies, unanswered, [{ all }]] = await Promise.all([
    repliesAvailable ? getRepliesByReview(result.rows.map((r) => r.id)) : Promise.resolve(new Map<number, ReviewReplyView>()),
    repliesAvailable ? countUnansweredReviews(sellerId) : Promise.resolve(0),
    db.select({ all: sql<number>`count(*)::int` }).from(review).where(eq(review.sellerId, sellerId)),
  ])
  return {
    ...result,
    counts: { all, unanswered },
    repliesAvailable,
    rows: result.rows.map((r) => ({ ...r, buyerName: r.buyerName ?? "Comprador", reply: replies.get(r.id) ?? null })),
  }
}
