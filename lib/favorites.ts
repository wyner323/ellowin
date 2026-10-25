import type { PoolClient } from "@neondatabase/serverless"
import { pool } from "@/lib/db"
import { isUndefinedTable } from "@/lib/db-errors"
import { publicNameRaw } from "@/lib/public-name"

/**
 * Favoritos do comprador. A tabela `favorite` é de uma migração recente: os leitores daqui tratam a tabela inexistente
 * como "indisponível" (`available: false`) em vez de derrubar a página do anúncio ou a lista.
 */

/** Teto de anúncios guardados por pessoa. */
export const MAX_FAVORITES = 200

/** Menor preço À VENDA do anúncio (item ativo, com estoque, de anúncio ativo); nulo se nada está à venda. */
export async function minSellingPrice(productId: number, client?: Pick<PoolClient, "query">): Promise<number | null> {
  const { rows } = await (client ?? pool).query<{ min: number | null }>(
    `SELECT min(v."priceCents") AS min
       FROM "product_variant" v JOIN "product" p ON p."id" = v."productId"
      WHERE p."id" = $1 AND p."status" = 'ativo' AND v."active" = true AND v."stock" > 0`,
    [productId],
  )
  return rows[0]?.min ?? null
}

/** O anúncio está nos favoritos da pessoa? `available` falso se a migração ainda não foi aplicada. */
export async function getFavoriteState(userId: string, productId: number): Promise<{ available: boolean; favorite: boolean }> {
  try {
    const { rows } = await pool.query(`SELECT 1 FROM "favorite" WHERE "userId" = $1 AND "productId" = $2`, [userId, productId])
    return { available: true, favorite: rows.length > 0 }
  } catch (error) {
    if (isUndefinedTable(error)) return { available: false, favorite: false }
    throw error
  }
}

export type FavoriteItem = {
  productId: number
  slug: string
  title: string
  game: string | null
  seller: string
  coverUrl: string | null
  /** menor preço à venda agora (centavos); nulo se não está à venda */
  priceCents: number | null
  /** anúncio ativo com algum item em estoque */
  forSale: boolean
}

/** Favoritos da pessoa, mais novos primeiro. Anúncio de vendedor com conta excluída não aparece. */
export async function getFavorites(userId: string): Promise<{ available: boolean; items: FavoriteItem[] }> {
  try {
    const { rows } = await pool.query<{
      id: number
      slug: string
      title: string
      game: string | null
      status: string
      price: number | null
      cover: string | null
      seller: string
    }>(
      `SELECT p."id", p."slug", p."title", p."game", p."status",
              (SELECT min(v."priceCents") FROM "product_variant" v WHERE v."productId" = p."id" AND v."active" = true AND v."stock" > 0) AS price,
              (SELECT i."url" FROM "product_image" i WHERE i."productId" = p."id" ORDER BY i."sortOrder", i."id" LIMIT 1) AS cover,
              coalesce(s."storeName", ${publicNameRaw("u")}) AS seller
         FROM "favorite" f
         JOIN "product" p ON p."id" = f."productId"
         JOIN "user" u ON u."id" = p."sellerId"
         LEFT JOIN "seller_application" s ON s."userId" = p."sellerId"
        WHERE f."userId" = $1 AND u."deletedAt" IS NULL
        ORDER BY f."createdAt" DESC, p."id" DESC
        LIMIT ${MAX_FAVORITES}`,
      [userId],
    )
    return {
      available: true,
      items: rows.map((r) => ({
        productId: r.id,
        slug: r.slug,
        title: r.title,
        game: r.game,
        seller: r.seller,
        coverUrl: r.cover,
        priceCents: r.status === "ativo" ? r.price : null,
        forSale: r.status === "ativo" && r.price !== null,
      })),
    }
  } catch (error) {
    if (isUndefinedTable(error)) return { available: false, items: [] }
    throw error
  }
}

/** LGPD: ao anonimizar a conta os favoritos (preferência pessoal, sem prazo de retenção) são apagados. Checa a tabela antes: um erro dentro da transação a deixaria abortada. */
export async function purgeFavorites(client: PoolClient, userId: string) {
  const { rows } = await client.query<{ ok: boolean }>(`SELECT to_regclass('public.favorite') IS NOT NULL AS ok`)
  if (rows[0]?.ok !== true) return
  await client.query(`DELETE FROM "favorite" WHERE "userId" = $1`, [userId])
}
