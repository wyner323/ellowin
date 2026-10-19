import { pool } from "@/lib/db"

/** Estoque de uma variação com poucas unidades (ou nenhuma) em anúncio ativo. */
export type LowStockItem = { productId: number; title: string; label: string; stock: number }

/** A partir de quantas unidades o painel avisa. */
export const LOW_STOCK_THRESHOLD = 2

/**
 * Variações ATIVAS de anúncios ATIVOS do vendedor com `stock <= LOW_STOCK_THRESHOLD`, das mais urgentes (sem
 * estoque) para as menos. Variação pausada ou anúncio pausado não entra: o vendedor já decidiu não vender.
 */
export async function getLowStock(sellerId: string, limit = 20): Promise<LowStockItem[]> {
  const { rows } = await pool.query<{ id: number; title: string; label: string; stock: number }>(
    `SELECT p."id", p."title", v."label", v."stock"
       FROM "product_variant" v JOIN "product" p ON p."id" = v."productId"
      WHERE p."sellerId" = $1 AND p."status" = 'ativo' AND v."active" = true AND v."stock" <= $2
      ORDER BY v."stock" ASC, p."id" ASC, v."id" ASC
      LIMIT $3`,
    [sellerId, LOW_STOCK_THRESHOLD, limit],
  )
  return rows.map((r) => ({ productId: Number(r.id), title: r.title, label: r.label, stock: Number(r.stock) }))
}
