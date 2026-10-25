import { pool } from "@/lib/db"
import { isUndefinedTable } from "@/lib/db-errors"
import { publicNameRaw } from "@/lib/public-name"

/**
 * Acompanhamento dos vendedores de ENTREGA AUTOMÁTICA, para a moderação. Qualquer vendedor aprovado pode usar a entrega
 * automática (sem trava de vendas), então o freio é este: ver, por vendedor, quantos pedidos saíram do estoque, quantos
 * viraram disputa e quantas deram razão ao comprador. Só números e nomes PÚBLICOS (nunca nome legal, CPF ou e-mail).
 * Sem a tabela do estoque (migração 0011 pendente) a tela avisa em vez de quebrar.
 */

/** Um vendedor entra em "atenção" com pelo menos este número de pedidos automáticos... */
export const FLAG_MIN_ORDERS = 5
/** ...e esta porcentagem de disputas (ou mais) sobre eles. */
export const FLAG_DISPUTE_PERCENT = 10

export type AutoSellerRow = {
  sellerId: string
  name: string
  orders: number
  disputes: number
  /** disputas resolvidas a favor do comprador */
  buyerWon: number
  /** pedidos que terminaram reembolsados (disputa, prazo ou cancelamento) */
  refunded: number
  /** disputas ÷ pedidos, em % */
  disputePercent: number
  flagged: boolean
}

export function disputePercent(orders: number, disputes: number): number {
  return orders > 0 ? (disputes / orders) * 100 : 0
}

export function isFlagged(orders: number, disputes: number): boolean {
  return orders >= FLAG_MIN_ORDERS && disputePercent(orders, disputes) >= FLAG_DISPUTE_PERCENT
}

export async function getAutoDeliverySellers(limit = 100): Promise<{ available: boolean; rows: AutoSellerRow[] }> {
  try {
    const { rows } = await pool.query<{
      sellerId: string
      name: string
      orders: number
      disputes: number
      buyerWon: number
      refunded: number
    }>(
      `SELECT o."sellerId",
              coalesce(s."storeName", ${publicNameRaw("u")}) AS name,
              count(*)::int AS orders,
              count(d."id")::int AS disputes,
              (count(*) FILTER (WHERE d."status" = 'resolvida_comprador'))::int AS "buyerWon",
              (count(*) FILTER (WHERE o."status" = 'reembolsado'))::int AS refunded
         FROM "delivery_stock_item" i
         JOIN "order" o ON o."id" = i."orderId"
         JOIN "user" u ON u."id" = o."sellerId"
         LEFT JOIN "seller_application" s ON s."userId" = o."sellerId"
         LEFT JOIN "dispute" d ON d."orderId" = o."id"
        GROUP BY o."sellerId", s."storeName", u."id", u."displayName"
        LIMIT ${Math.min(Math.max(1, limit), 500)}`,
    )

    const mapped = rows.map((r) => ({
      sellerId: r.sellerId,
      name: r.name,
      orders: r.orders,
      disputes: r.disputes,
      buyerWon: r.buyerWon,
      refunded: r.refunded,
      disputePercent: disputePercent(r.orders, r.disputes),
      flagged: isFlagged(r.orders, r.disputes),
    }))
    // Em atenção primeiro, depois a maior taxa de disputa e o maior volume.
    mapped.sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.disputePercent - a.disputePercent || b.orders - a.orders || a.name.localeCompare(b.name))
    return { available: true, rows: mapped }
  } catch (error) {
    if (isUndefinedTable(error)) return { available: false, rows: [] }
    throw error
  }
}
