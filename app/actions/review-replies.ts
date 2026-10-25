"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { isUndefinedTable } from "@/lib/db-errors"
import { product, review, reviewReply } from "@/lib/db/schema"
import { MAX_REPLY, MIN_REPLY } from "@/lib/review-reply-rules"
import { hitRateLimit } from "@/lib/rate-limit"
import { getUserId } from "@/lib/session"
import type { ActionResult } from "@/app/actions/auth"

/**
 * O vendedor responde (e pode editar ou apagar) a resposta pública a uma avaliação RECEBIDA por ele. O id da avaliação
 * só escolhe a linha: quem manda é a sessão, e a avaliação tem de ser dele (`review.sellerId`). A resposta é pública,
 * por isso o mesmo tom de tamanho das respostas a perguntas, e há teto de volume.
 */

const MAX_REPLIES_PER_HOUR = 30

async function ownReview(reviewId: number, sellerId: string) {
  const [row] = await db
    .select({ id: review.id, orderId: review.orderId, productSlug: product.slug })
    .from(review)
    .innerJoin(product, eq(product.id, review.productId))
    .where(and(eq(review.id, reviewId), eq(review.sellerId, sellerId)))
    .limit(1)
  return row ?? null
}

function revalidateAround(row: { orderId: number; productSlug: string }) {
  revalidatePath("/painel/vendedor/avaliacoes")
  revalidatePath(`/produtos/${row.productSlug}`)
  revalidatePath(`/pedidos/${row.orderId}`)
}

export async function replyToReview(reviewId: number, body: string): Promise<ActionResult> {
  const userId = await getUserId()
  if (!Number.isInteger(reviewId) || reviewId < 1 || typeof body !== "string") return { ok: false, error: "Pedido inválido." }

  const text = body.trim()
  if (text.length < MIN_REPLY) return { ok: false, field: "body", error: `Escreva uma resposta com ao menos ${MIN_REPLY} caracteres.` }
  if (text.length > MAX_REPLY) return { ok: false, field: "body", error: `A resposta pode ter até ${MAX_REPLY} caracteres.` }

  const row = await ownReview(reviewId, userId)
  if (!row) return { ok: false, error: "Avaliação não encontrada." }

  if (!(await hitRateLimit(`review-reply:${userId}`, MAX_REPLIES_PER_HOUR, 60 * 60))) {
    return { ok: false, error: "Muitas respostas em pouco tempo. Tente de novo mais tarde." }
  }

  try {
    await db
      .insert(reviewReply)
      .values({ reviewId: row.id, sellerId: userId, body: text })
      .onConflictDoUpdate({ target: reviewReply.reviewId, set: { body: text, updatedAt: new Date() } })
  } catch (error) {
    if (isUndefinedTable(error)) return { ok: false, error: "As respostas às avaliações ainda não estão disponíveis." }
    throw error
  }

  revalidateAround(row)
  return { ok: true, message: "Resposta publicada." }
}

export async function deleteReviewReply(reviewId: number): Promise<ActionResult> {
  const userId = await getUserId()
  if (!Number.isInteger(reviewId) || reviewId < 1) return { ok: false, error: "Pedido inválido." }

  const row = await ownReview(reviewId, userId)
  if (!row) return { ok: false, error: "Avaliação não encontrada." }

  try {
    await db.delete(reviewReply).where(and(eq(reviewReply.reviewId, row.id), eq(reviewReply.sellerId, userId)))
  } catch (error) {
    if (isUndefinedTable(error)) return { ok: false, error: "As respostas às avaliações ainda não estão disponíveis." }
    throw error
  }

  revalidateAround(row)
  return { ok: true, message: "Resposta apagada." }
}
