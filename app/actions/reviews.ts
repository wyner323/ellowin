"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { order, review } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { withTransaction } from "@/lib/wallet"
import type { ActionResult } from "@/app/actions/auth"

/**
 * Avaliação pós-compra: é o que define o padrão de qualidade do vendedor.
 *
 * Regras: só o comprador avalia, só depois de concluir o pedido e só uma vez.
 * A unicidade de `review.orderId` no banco garante a última condição mesmo em
 * dois cliques simultâneos.
 */
export async function submitReview(input: {
  orderId: number
  rating: number
  comment: string
}): Promise<ActionResult> {
  const buyerId = await getUserId()

  const rating = Math.round(input.rating)
  if (!Number.isFinite(rating) || rating < 1 || rating > 5)
    return { ok: false, field: "rating", error: "Escolha uma nota de 1 a 5 estrelas." }

  const [row] = await db
    .select()
    .from(order)
    .where(and(eq(order.id, input.orderId), eq(order.buyerId, buyerId)))
    .limit(1)

  if (!row) return { ok: false, error: "Pedido não encontrado." }
  if (row.status !== "concluido")
    return {
      ok: false,
      error: "Confirme o recebimento antes de avaliar o vendedor.",
    }

  const [existing] = await db
    .select({ id: review.id })
    .from(review)
    .where(eq(review.orderId, row.id))
    .limit(1)

  if (existing) return { ok: false, error: "Você já avaliou este pedido." }

  const comment = input.comment.trim()

  try {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO "review" ("orderId", "productId", "sellerId", "buyerId", "rating", "comment")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.id, row.productId, row.sellerId, buyerId, rating, comment || null],
      )

      // A média fica materializada no produto para a vitrine não precisar
      // recalcular a cada listagem.
      await client.query(
        `UPDATE "product"
            SET "ratingSum" = "ratingSum" + $2,
                "ratingCount" = "ratingCount" + 1
          WHERE "id" = $1`,
        [row.productId, rating],
      )
    })
  } catch {
    return { ok: false, error: "Você já avaliou este pedido." }
  }

  revalidatePath(`/pedidos/${row.id}`)
  revalidatePath("/pedidos")
  revalidatePath("/")

  return { ok: true, message: "Avaliação registrada. Obrigado pelo retorno." }
}
