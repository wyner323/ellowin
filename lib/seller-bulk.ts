import { and, asc, desc, eq, ilike, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { product, productVariant } from "@/lib/db/schema"
import { escapeLike, resolvePage } from "@/lib/pagination"

/** Itens por página na edição em lote (mais que nas listas comuns: a tela é uma tabela de trabalho). */
export const BULK_PAGE_SIZE = 50

/**
 * Itens ativos dos anúncios do vendedor, para a tela de edição em lote: título do anúncio, estado, tipo de entrega,
 * nome do item, preço e estoque. Mais novos primeiro, com a busca por título do anúncio.
 */
export async function getBulkRowsPage(sellerId: string, { q, page: requestedPage }: { q?: string; page: number }) {
  const term = q?.trim().slice(0, 100)
  const conditions: SQL[] = [eq(product.sellerId, sellerId), eq(productVariant.active, true)]
  if (term) conditions.push(ilike(product.title, `%${escapeLike(term)}%`))
  const where = and(...conditions)

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(productVariant)
    .innerJoin(product, eq(product.id, productVariant.productId))
    .where(where)

  const { page, pages, offset, limit } = resolvePage(requestedPage, total, BULK_PAGE_SIZE)
  const rows = await db
    .select({
      variantId: productVariant.id,
      productId: product.id,
      productTitle: product.title,
      productStatus: product.status,
      deliveryType: product.deliveryType,
      label: productVariant.label,
      priceCents: productVariant.priceCents,
      stock: productVariant.stock,
    })
    .from(productVariant)
    .innerJoin(product, eq(product.id, productVariant.productId))
    .where(where)
    .orderBy(desc(product.createdAt), desc(product.id), asc(productVariant.sortOrder), asc(productVariant.id))
    .limit(limit)
    .offset(offset)

  return { rows, total, page, pages }
}
