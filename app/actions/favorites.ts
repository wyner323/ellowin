"use server"

import { and, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { isUndefinedTable } from "@/lib/db-errors"
import { favorite, product, user } from "@/lib/db/schema"
import { MAX_FAVORITES, minSellingPrice } from "@/lib/favorites"
import { hitRateLimit } from "@/lib/rate-limit"
import { getUserId } from "@/lib/session"
import type { ActionResult } from "@/app/actions/auth"

/**
 * Guarda ou tira um anúncio dos favoritos da própria pessoa. O id do anúncio só escolhe a linha: quem favorita é sempre a
 * sessão. Não precisa de e-mail confirmado (é só uma preferência), mas tem teto de volume e de quantidade. Ao guardar,
 * anota o menor preço à venda de agora: é dele que o aviso de queda de preço parte.
 */
export async function toggleFavorite(productId: number): Promise<ActionResult & { favorite?: boolean }> {
  const userId = await getUserId()
  if (!Number.isInteger(productId) || productId < 1) return { ok: false, error: "Pedido inválido." }

  const [item] = await db
    .select({ id: product.id, sellerId: product.sellerId, slug: product.slug, deletedAt: user.deletedAt })
    .from(product)
    .innerJoin(user, eq(user.id, product.sellerId))
    .where(eq(product.id, productId))
    .limit(1)
  if (!item || item.deletedAt) return { ok: false, error: "Anúncio não encontrado." }
  if (item.sellerId === userId) return { ok: false, error: "Você não pode favoritar o seu próprio anúncio." }

  if (!(await hitRateLimit(`favorite:${userId}`, 60, 60 * 60))) {
    return { ok: false, error: "Muitas alterações em pouco tempo. Tente de novo mais tarde." }
  }

  try {
    const removed = await db
      .delete(favorite)
      .where(and(eq(favorite.userId, userId), eq(favorite.productId, productId)))
      .returning({ productId: favorite.productId })

    if (removed.length > 0) {
      revalidatePath("/favoritos")
      return { ok: true, favorite: false, message: "Removido dos favoritos." }
    }

    const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(favorite).where(eq(favorite.userId, userId))
    if ((count?.n ?? 0) >= MAX_FAVORITES) {
      return { ok: false, error: `Você pode guardar até ${MAX_FAVORITES} anúncios. Remova algum para guardar outro.` }
    }

    await db
      .insert(favorite)
      .values({ userId, productId, baselineCents: await minSellingPrice(productId) })
      .onConflictDoNothing()
  } catch (error) {
    if (isUndefinedTable(error)) return { ok: false, error: "Os favoritos ainda não estão disponíveis." }
    throw error
  }

  revalidatePath("/favoritos")
  return { ok: true, favorite: true, message: "Guardado nos favoritos. Avisamos por e-mail se o preço baixar." }
}
