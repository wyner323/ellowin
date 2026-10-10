import { pool } from "@/lib/db"
import type { CategoryStat, MarketStats } from "@/lib/home-stats"
import { findGameBySlug, slugifyGame } from "@/lib/product-catalog"

/**
 * Números reais da vitrine, lidos do banco. A regra de "anúncio à venda" é a
 * mesma dos cards (`activeRealProductsQuery` em lib/marketplace.ts): produto
 * ativo com pelo menos uma variante ativa e com estoque.
 */

/** Pedidos 1–5 são carga de demonstração antiga (ver lib/reconcile.ts). */
const LEGACY_SEED_ORDER_IDS = [1, 2, 3, 4, 5]

const FOR_SALE = `
  p."status" = 'ativo'
  and exists (
    select 1 from "product_variant" v
    where v."productId" = p."id" and v."active" = true and v."stock" > 0
  )`

export async function getMarketStats(): Promise<MarketStats> {
  const { rows } = await pool.query<{
    active_listings: number
    approved_sellers: number
    review_count: number
    rating_avg: number | null
    delivered_orders: number
    avg_delivery_minutes: number | null
  }>(
    `select
       (select count(*)::int from "product" p where ${FOR_SALE}) as active_listings,
       (select count(*)::int from "seller_application" where "status" = 'aprovado') as approved_sellers,
       (select count(*)::int from "review") as review_count,
       (select round(avg("rating")::numeric, 2)::float from "review") as rating_avg,
       (select count(*)::int from "order"
          where "status" = 'concluido' and "deliveredAt" is not null
            and not ("id" = any($1))) as delivered_orders,
       (select round(avg(extract(epoch from ("deliveredAt" - "createdAt")) / 60)::numeric, 1)::float
          from "order"
          where "status" = 'concluido' and "deliveredAt" is not null
            and not ("id" = any($1))) as avg_delivery_minutes`,
    [LEGACY_SEED_ORDER_IDS],
  )

  const r = rows[0]
  return {
    activeListings: r.active_listings,
    approvedSellers: r.approved_sellers,
    reviewCount: r.review_count,
    ratingAvg: r.rating_avg,
    deliveredOrders: r.delivered_orders,
    avgDeliveryMinutes: r.avg_delivery_minutes,
  }
}

/** Contagem e menor preço por categoria, só de anúncios reais à venda. */
export async function getCategoryStats(): Promise<Record<string, CategoryStat>> {
  const { rows } = await pool.query<{ slug: string; count: number; min_price: number }>(
    `select p."categorySlug" as slug, count(*)::int as count,
            min((select min(v."priceCents") from "product_variant" v
                 where v."productId" = p."id" and v."active" = true and v."stock" > 0))::int as min_price
       from "product" p
      where ${FOR_SALE}
      group by p."categorySlug"`,
  )
  return Object.fromEntries(
    rows.map((r) => [r.slug, { count: r.count, minPriceCents: r.min_price }]),
  )
}

/** Jogos que têm anúncio real à venda, do mais anunciado para o menos, só os que têm página em /jogos. */
export async function getListedGames(limit = 10): Promise<{ name: string; slug: string; count: number }[]> {
  const { rows } = await pool.query<{ game: string; count: number }>(
    `select p."game" as game, count(*)::int as count
       from "product" p
      where ${FOR_SALE} and p."game" is not null
      group by p."game"
      order by count desc, p."game" asc`,
  )
  return rows
    .map((r) => ({ name: r.game, slug: slugifyGame(r.game), count: r.count }))
    .filter((g) => findGameBySlug(g.slug) !== null)
    .slice(0, limit)
}
