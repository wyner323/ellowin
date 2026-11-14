import { pool } from "@/lib/db"
import { batchTableExistsIn } from "@/lib/delivery-stock"

/** Fila da moderação para lotes de estoque (migração 0015). Mostra só a máscara dos itens, nunca o conteúdo. */

export type BatchQueueRow = {
  id: number
  status: "pendente" | "aprovado" | "recusado" | "quarentena"
  itemCount: number
  statement: string | null
  reviewNote: string | null
  createdAt: Date
  reviewedAt: Date | null
  productId: number
  productTitle: string
  categorySlug: string
  variantLabel: string
  sellerId: string
  sellerName: string
  storeName: string | null
  completedSales: number
  /** itens ainda não vendidos do lote (os que a decisão alcança) */
  unsold: number
  masks: string[]
}

const MASKS_SHOWN = 8

export async function listStockBatches(limit = 100): Promise<{ available: boolean; pending: BatchQueueRow[]; others: BatchQueueRow[] }> {
  if (!(await batchTableExistsIn(pool))) return { available: false, pending: [], others: [] }
  const { rows } = await pool.query<Omit<BatchQueueRow, "masks">>(
    `SELECT b."id", b."status", b."itemCount", b."statement", b."reviewNote", b."createdAt", b."reviewedAt",
            p."id" AS "productId", p."title" AS "productTitle", p."categorySlug", v."label" AS "variantLabel",
            b."sellerId", u."name" AS "sellerName", s."storeName",
            (SELECT count(*)::int FROM "order" o WHERE o."sellerId" = b."sellerId" AND o."status" = 'concluido') AS "completedSales",
            (SELECT count(*)::int FROM "delivery_stock_item" i WHERE i."batchId" = b."id" AND i."orderId" IS NULL) AS "unsold"
       FROM "stock_batch" b
       JOIN "product_variant" v ON v."id" = b."variantId"
       JOIN "product" p ON p."id" = v."productId"
       JOIN "user" u ON u."id" = b."sellerId"
       LEFT JOIN "seller_application" s ON s."userId" = b."sellerId"
      ORDER BY (b."status" = 'pendente') DESC, b."id" DESC
      LIMIT $1`,
    [limit],
  )

  const withMasks: BatchQueueRow[] = []
  for (const row of rows) {
    const masks =
      row.status === "pendente" || row.status === "quarentena"
        ? (
            await pool.query<{ mask: string }>(
              `SELECT "mask" FROM "delivery_stock_item" WHERE "batchId" = $1 AND "orderId" IS NULL ORDER BY "id" LIMIT ${MASKS_SHOWN}`,
              [row.id],
            )
          ).rows.map((r) => r.mask)
        : []
    withMasks.push({ ...row, masks })
  }
  return { available: true, pending: withMasks.filter((r) => r.status === "pendente"), others: withMasks.filter((r) => r.status !== "pendente") }
}
