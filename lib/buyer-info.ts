import type { PoolClient } from "@neondatabase/serverless"
import { pool } from "@/lib/db"
import { categoryRule, describeBuyerInfo, type BuyerField, type BuyerInfo } from "@/lib/category-rules"

/**
 * Dados que o comprador informou ao pagar (ID do jogador, servidor): tabela `order_buyer_info`, migração 0015. Antes dela a
 * compra segue como sempre e a tela do pedido simplesmente não mostra nada.
 */

export async function buyerInfoTableExistsIn(client: Pick<PoolClient, "query">) {
  const { rows } = await client.query<{ ok: boolean }>(`SELECT to_regclass('public.order_buyer_info') IS NOT NULL AS ok`)
  return rows[0]?.ok === true
}

/** Campos que a página do anúncio pede ao comprador: os da categoria, e nenhum enquanto a tabela não existe. */
export async function buyerFieldsFor(categorySlug: string): Promise<BuyerField[]> {
  const fields = categoryRule(categorySlug).buyerFields
  if (fields.length === 0 || !(await buyerInfoTableExistsIn(pool))) return []
  return fields
}

/** Dados do pedido para a tela (o chamador já conferiu que a pessoa é parte do pedido ou da moderação). */
export async function getOrderBuyerInfo(orderId: number, categorySlug: string | null): Promise<{ label: string; value: string }[]> {
  if (!categorySlug || !(await buyerInfoTableExistsIn(pool))) return []
  const { rows } = await pool.query<{ info: BuyerInfo }>(`SELECT "info" FROM "order_buyer_info" WHERE "orderId" = $1`, [orderId])
  return rows[0] ? describeBuyerInfo(categorySlug, rows[0].info) : []
}
