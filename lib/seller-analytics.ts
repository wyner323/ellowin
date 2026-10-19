import { pool } from "@/lib/db"
import { MIN_PRICE_PEERS as MIN_PEERS, delta, priceVsMarket, ratio, topWithOthers, type AnalyticsPeriod, type Delta, type PriceVsMarket } from "@/lib/analytics-math"

/**
 * Métricas de venda de UM vendedor, lidas do banco em SQL (nada de carregar pedidos para somar em JS).
 *
 * - Janela atual = os últimos `days` dias de calendário de Brasília, contando hoje; janela anterior = os `days` dias
 *   imediatamente antes. Toda comparação "vs. período anterior" usa essas duas.
 * - Venda = pedido `concluido`, contada no dia de `completedAt` (quando o dinheiro foi liberado). Pedido = pedido
 *   criado, contado no dia de `createdAt`, em qualquer status.
 * - Visualizações vêm de `product_view_daily`. Se a tabela ainda não existir (migração não aplicada), `viewsAvailable`
 *   fica falso e o painel mostra "sem dados" em vez de quebrar.
 * - Só o que é do vendedor: toda consulta filtra por `sellerId`, e nenhum dado pessoal do comprador sai daqui.
 */

const TZ = "America/Sao_Paulo"
/** Dia de calendário de Brasília de uma coluna `timestamp` guardada em UTC. */
const localDay = (col: string) => `(((${col}) AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}')::date`
const TODAY = `(now() AT TIME ZONE '${TZ}')::date`

export type DayPoint = {
  /** YYYY-MM-DD (dia de Brasília) */
  day: string
  revenueCents: number
  concluded: number
  orders: number
  /** nulo quando as visualizações não estão disponíveis */
  views: number | null
}

export type PeriodTotals = {
  revenueCents: number
  grossCents: number
  feeCents: number
  concluded: number
  orders: number
  views: number | null
  avgTicketCents: number | null
  /** pedidos / visualizações; nulo sem visualizações */
  conversion: number | null
}

export type BreakdownRow = { label: string; value: number; count: number }

export type ProductRow = {
  id: number
  title: string
  slug: string
  status: string
  revenueCents: number
  concluded: number
  orders: number
  views: number | null
  conversion: number | null
  /** menor preço à venda deste anúncio (nulo se pausado ou sem estoque) */
  priceCents: number | null
  /** mediana de anúncios parecidos de OUTROS vendedores e quantos são; a comparação só aparece com 3 ou mais */
  marketMedianCents: number | null
  marketPeers: number
  priceComparison: PriceVsMarket | null
}

export type OperationsStats = {
  /** pedidos criados na janela, por desfecho */
  orders: number
  cancelled: number
  refunded: number
  disputed: number
  cancelRate: number | null
  refundRate: number | null
  disputeRate: number | null
  /** entregas feitas na janela com prazo prometido */
  deliveriesWithDeadline: number
  onTimePercent: number | null
  avgDeliveryHours: number | null
}

export type ReleaseDay = { day: string; count: number; cents: number }

export type SellerAnalytics = {
  period: AnalyticsPeriod
  from: string
  to: string
  viewsAvailable: boolean
  current: PeriodTotals
  previous: PeriodTotals
  /** variação de cada número chave contra o período anterior */
  deltas: { revenue: Delta; orders: Delta; avgTicket: Delta | null; conversion: Delta | null; views: Delta | null }
  series: DayPoint[]
  previousSeries: DayPoint[]
  byGame: BreakdownRow[]
  byCategory: BreakdownRow[]
  products: ProductRow[]
  operations: OperationsStats
  previousOperations: OperationsStats
  buyers: { total: number; returning: number; returningRevenueCents: number; revenueCents: number }
  /** pedidos entregues esperando a liberação automática, por dia previsto */
  releases: ReleaseDay[]
}

type SeriesRow = { day: string; revenue: string; gross: string; fee: string; concluded: number; orders: number }

function totals(points: DayPoint[], money: { gross: number; fee: number }): PeriodTotals {
  const revenueCents = points.reduce((s, p) => s + p.revenueCents, 0)
  const concluded = points.reduce((s, p) => s + p.concluded, 0)
  const orders = points.reduce((s, p) => s + p.orders, 0)
  const hasViews = points.length > 0 && points.every((p) => p.views !== null)
  const views = hasViews ? points.reduce((s, p) => s + (p.views ?? 0), 0) : null
  return {
    revenueCents,
    grossCents: money.gross,
    feeCents: money.fee,
    concluded,
    orders,
    views,
    avgTicketCents: concluded > 0 ? Math.round(revenueCents / concluded) : null,
    conversion: views !== null ? ratio(orders, views) : null,
  }
}

function toOps(row: Record<string, number | string | null> | undefined, delivery: Record<string, number | string | null> | undefined): OperationsStats {
  const orders = Number(row?.orders ?? 0)
  const cancelled = Number(row?.cancelled ?? 0)
  const refunded = Number(row?.refunded ?? 0)
  const disputed = Number(row?.disputed ?? 0)
  const withDeadline = Number(delivery?.total ?? 0)
  const onTime = Number(delivery?.on_time ?? 0)
  return {
    orders,
    cancelled,
    refunded,
    disputed,
    cancelRate: ratio(cancelled, orders),
    refundRate: ratio(refunded, orders),
    disputeRate: ratio(disputed, orders),
    deliveriesWithDeadline: withDeadline,
    onTimePercent: withDeadline > 0 ? Math.round((onTime / withDeadline) * 100) : null,
    avgDeliveryHours: delivery?.avg_hours != null ? Number(delivery.avg_hours) : null,
  }
}

/**
 * Preço de cada anúncio ativo do vendedor contra a mediana dos anúncios parecidos (mesmo jogo e mesma categoria, de
 * OUTROS vendedores, ativos e com estoque). Só sai a mediana e a contagem: nunca o preço, o título ou o dono de um
 * concorrente.
 */
async function getPriceBenchmarks(sellerId: string): Promise<Map<number, { price: number; median: number | null; peers: number }>> {
  const min = (alias: string) =>
    `(SELECT min(v."priceCents") FROM "product_variant" v WHERE v."productId" = ${alias}."id" AND v."active" = true AND v."stock" > 0)`
  const { rows } = await pool.query<{ id: number; price: number; median: number | null; peers: number }>(
    `WITH mine AS (
       SELECT p."id", p."categorySlug", lower(trim(p."game")) AS g, ${min("p")} AS price
         FROM "product" p WHERE p."sellerId" = $1 AND p."status" = 'ativo' AND nullif(trim(p."game"), '') IS NOT NULL
     ),
     peers AS (
       SELECT p."categorySlug", lower(trim(p."game")) AS g, ${min("p")} AS price
         FROM "product" p WHERE p."sellerId" <> $1 AND p."status" = 'ativo' AND nullif(trim(p."game"), '') IS NOT NULL
     )
     SELECT mine."id", mine.price, count(peers.price)::int AS peers,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY peers.price) AS median
       FROM mine LEFT JOIN peers ON peers.g = mine.g AND peers."categorySlug" = mine."categorySlug" AND peers.price IS NOT NULL
      WHERE mine.price IS NOT NULL
      GROUP BY mine."id", mine.price`,
    [sellerId],
  )
  return new Map(rows.map((r) => [Number(r.id), { price: Number(r.price), median: r.median === null ? null : Math.round(Number(r.median)), peers: Number(r.peers) }]))
}

/** Visualizações dos últimos `days` dias por anúncio do vendedor; nulo se a tabela ainda não existe. */
export async function getRecentViews(sellerId: string, days = 30): Promise<Map<number, number> | null> {
  try {
    const { rows } = await pool.query<{ id: number; views: number }>(
      `SELECT v."productId" AS id, sum(v."views")::int AS views
         FROM "product_view_daily" v JOIN "product" p ON p."id" = v."productId"
        WHERE p."sellerId" = $1 AND v."day" >= ${TODAY} - ($2::int - 1)
        GROUP BY 1`,
      [sellerId, days],
    )
    return new Map(rows.map((r) => [Number(r.id), Number(r.views)]))
  } catch {
    return null
  }
}

export async function getSellerAnalytics(sellerId: string, days: AnalyticsPeriod): Promise<SellerAnalytics> {
  const winStart = `${TODAY} - ($2::int - 1)` // primeiro dia da janela atual
  const prevStart = `${TODAY} - ($2::int * 2 - 1)` // primeiro dia da janela anterior

  const [seriesRes, opsRes, deliveryRes, gameRes, categoryRes, productRes, buyersRes, releaseRes, benchmarks] = await Promise.all([
    pool.query<SeriesRow>(
      `WITH days AS (
         SELECT d::date AS day FROM generate_series(${prevStart}, ${TODAY}, interval '1 day') d
       ),
       done AS (
         SELECT ${localDay('"completedAt"')} AS day, count(*)::int AS concluded,
                coalesce(sum("sellerNetCents"), 0)::bigint AS revenue,
                coalesce(sum("amountCents"), 0)::bigint AS gross,
                coalesce(sum("feeCents"), 0)::bigint AS fee
           FROM "order" WHERE "sellerId" = $1 AND "status" = 'concluido' AND "completedAt" IS NOT NULL GROUP BY 1
       ),
       made AS (
         SELECT ${localDay('"createdAt"')} AS day, count(*)::int AS orders
           FROM "order" WHERE "sellerId" = $1 GROUP BY 1
       )
       SELECT days.day::text AS day,
              coalesce(done.revenue, 0)::text AS revenue, coalesce(done.gross, 0)::text AS gross,
              coalesce(done.fee, 0)::text AS fee, coalesce(done.concluded, 0) AS concluded,
              coalesce(made.orders, 0) AS orders
         FROM days LEFT JOIN done USING (day) LEFT JOIN made USING (day)
        ORDER BY days.day`,
      [sellerId, days],
    ),
    // desfecho dos pedidos CRIADOS em cada janela (cur/prev)
    pool.query(
      `SELECT CASE WHEN o.ld >= ${winStart} THEN 'cur' ELSE 'prev' END AS win,
              count(*)::int AS orders,
              count(*) FILTER (WHERE o."status" = 'cancelado')::int AS cancelled,
              count(*) FILTER (WHERE o."status" = 'reembolsado')::int AS refunded,
              count(d."id")::int AS disputed
         FROM (SELECT o2.*, ${localDay('o2."createdAt"')} AS ld FROM "order" o2 WHERE o2."sellerId" = $1) o
         LEFT JOIN "dispute" d ON d."orderId" = o."id"
        WHERE o.ld >= ${prevStart}
        GROUP BY 1`,
      [sellerId, days],
    ),
    // entregas feitas em cada janela; só as com prazo prometido entram no "no prazo" (mesma regra do perfil público)
    pool.query(
      `SELECT CASE WHEN x.ld >= ${winStart} THEN 'cur' ELSE 'prev' END AS win,
              count(*) FILTER (WHERE x."deliveryDueAt" IS NOT NULL)::int AS total,
              count(*) FILTER (WHERE x."deliveryDueAt" IS NOT NULL AND x."deliveredAt" <= x."deliveryDueAt")::int AS on_time,
              avg(extract(epoch FROM (x."deliveredAt" - x."createdAt")) / 3600) FILTER (WHERE x."deliveryDueAt" IS NOT NULL) AS avg_hours
         FROM (SELECT o."deliveredAt", o."deliveryDueAt", o."createdAt", ${localDay('o."deliveredAt"')} AS ld
                 FROM "order" o WHERE o."sellerId" = $1 AND o."deliveredAt" IS NOT NULL) x
        WHERE x.ld >= ${prevStart}
        GROUP BY 1`,
      [sellerId, days],
    ),
    pool.query<{ label: string; value: string; count: number }>(
      `SELECT coalesce(nullif(trim(p."game"), ''), 'Sem jogo') AS label, sum(o."sellerNetCents")::bigint::text AS value, count(*)::int AS count
         FROM "order" o JOIN "product" p ON p."id" = o."productId"
        WHERE o."sellerId" = $1 AND o."status" = 'concluido' AND ${localDay('o."completedAt"')} >= ${winStart}
        GROUP BY 1 ORDER BY sum(o."sellerNetCents") DESC`,
      [sellerId, days],
    ),
    pool.query<{ label: string; value: string; count: number }>(
      `SELECT p."categorySlug" AS label, sum(o."sellerNetCents")::bigint::text AS value, count(*)::int AS count
         FROM "order" o JOIN "product" p ON p."id" = o."productId"
        WHERE o."sellerId" = $1 AND o."status" = 'concluido' AND ${localDay('o."completedAt"')} >= ${winStart}
        GROUP BY 1 ORDER BY sum(o."sellerNetCents") DESC`,
      [sellerId, days],
    ),
    pool.query<{ id: number; title: string; slug: string; status: string; revenue: string; concluded: number; orders: number }>(
      `SELECT p."id", p."title", p."slug", p."status",
              coalesce(o.revenue, 0)::text AS revenue, coalesce(o.concluded, 0) AS concluded, coalesce(o.orders, 0) AS orders
         FROM "product" p
         LEFT JOIN (
           SELECT "productId",
                  sum("sellerNetCents") FILTER (WHERE "status" = 'concluido' AND ${localDay('"completedAt"')} >= ${winStart})::bigint AS revenue,
                  count(*) FILTER (WHERE "status" = 'concluido' AND ${localDay('"completedAt"')} >= ${winStart})::int AS concluded,
                  count(*) FILTER (WHERE ${localDay('"createdAt"')} >= ${winStart})::int AS orders
             FROM "order" WHERE "sellerId" = $1 GROUP BY "productId"
         ) o ON o."productId" = p."id"
        WHERE p."sellerId" = $1 AND (p."status" = 'ativo' OR coalesce(o.orders, 0) > 0)
        ORDER BY coalesce(o.revenue, 0) DESC, p."id" ASC
        LIMIT 12`,
      [sellerId, days],
    ),
    // compradores da janela e quantos já tinham comprado de novo (2+ vendas concluídas no total com este vendedor)
    pool.query(
      `SELECT count(DISTINCT w."buyerId")::int AS buyers,
              count(DISTINCT w."buyerId") FILTER (WHERE w.lifetime >= 2)::int AS returning,
              coalesce(sum(w."sellerNetCents"), 0)::bigint::text AS revenue,
              coalesce(sum(w."sellerNetCents") FILTER (WHERE w.lifetime >= 2), 0)::bigint::text AS returning_revenue
         FROM (SELECT o."buyerId", o."sellerNetCents", o."completedAt",
                      count(*) OVER (PARTITION BY o."buyerId") AS lifetime
                 FROM "order" o WHERE o."sellerId" = $1 AND o."status" = 'concluido') w
        WHERE ${localDay('w."completedAt"')} >= ${winStart}`,
      [sellerId, days],
    ),
    pool.query<{ day: string; count: number; cents: string }>(
      `SELECT ${localDay('"autoReleaseAt"')}::text AS day, count(*)::int AS count, sum("sellerNetCents")::bigint::text AS cents
         FROM "order" WHERE "sellerId" = $1 AND "status" = 'entregue' AND "autoReleaseAt" IS NOT NULL
        GROUP BY 1 ORDER BY 1`,
      [sellerId],
    ),
    getPriceBenchmarks(sellerId),
  ])

  // ---- visualizações (opcionais: a tabela pode ainda não existir) ----
  let viewsByDay: Map<string, number> | null = null
  let viewsByProduct: Map<number, number> | null = null
  try {
    const [dayViews, productViews] = await Promise.all([
      pool.query<{ day: string; views: number }>(
        `SELECT v."day"::text AS day, sum(v."views")::int AS views
           FROM "product_view_daily" v JOIN "product" p ON p."id" = v."productId"
          WHERE p."sellerId" = $1 AND v."day" >= ${prevStart}
          GROUP BY 1`,
        [sellerId, days],
      ),
      pool.query<{ id: number; views: number }>(
        `SELECT v."productId" AS id, sum(v."views")::int AS views
           FROM "product_view_daily" v JOIN "product" p ON p."id" = v."productId"
          WHERE p."sellerId" = $1 AND v."day" >= ${winStart}
          GROUP BY 1`,
        [sellerId, days],
      ),
    ])
    viewsByDay = new Map(dayViews.rows.map((r) => [r.day, Number(r.views)]))
    viewsByProduct = new Map(productViews.rows.map((r) => [Number(r.id), Number(r.views)]))
  } catch {
    viewsByDay = null
    viewsByProduct = null
  }

  const all: DayPoint[] = seriesRes.rows.map((r) => ({
    day: r.day,
    revenueCents: Number(r.revenue),
    concluded: Number(r.concluded),
    orders: Number(r.orders),
    views: viewsByDay ? (viewsByDay.get(r.day) ?? 0) : null,
  }))
  const previousSeries = all.slice(0, days)
  const series = all.slice(days)

  const money = (rows: SeriesRow[]) => ({
    gross: rows.reduce((s, r) => s + Number(r.gross), 0),
    fee: rows.reduce((s, r) => s + Number(r.fee), 0),
  })
  const current = totals(series, money(seriesRes.rows.slice(days)))
  const previous = totals(previousSeries, money(seriesRes.rows.slice(0, days)))

  const win = (rows: Record<string, number | string | null>[], name: string) => rows.find((r) => r.win === name)

  const products: ProductRow[] = productRes.rows.map((r) => {
    const views = viewsByProduct ? (viewsByProduct.get(Number(r.id)) ?? 0) : null
    const bench = benchmarks.get(Number(r.id))
    return {
      id: Number(r.id),
      title: r.title,
      slug: r.slug,
      status: r.status,
      revenueCents: Number(r.revenue),
      concluded: Number(r.concluded),
      orders: Number(r.orders),
      views,
      conversion: views !== null ? ratio(Number(r.orders), views) : null,
      priceCents: bench?.price ?? null,
      marketMedianCents: bench && bench.peers >= MIN_PEERS ? bench.median : null,
      marketPeers: bench?.peers ?? 0,
      priceComparison: bench ? priceVsMarket(bench.price, bench.median, bench.peers) : null,
    }
  })

  const breakdown = (rows: { label: string; value: string; count: number }[], keep: number): BreakdownRow[] => {
    const counts = new Map(rows.map((r) => [r.label, Number(r.count)]))
    return topWithOthers(rows.map((r) => ({ label: r.label, value: Number(r.value) })), keep).map((r) => ({
      label: r.label,
      value: r.value,
      count: r.label === "Outros" ? rows.slice(keep).reduce((s, x) => s + Number(x.count), 0) : (counts.get(r.label) ?? 0),
    }))
  }

  const buyerRow = buyersRes.rows[0] ?? {}

  return {
    period: days,
    from: series[0]?.day ?? "",
    to: series.at(-1)?.day ?? "",
    viewsAvailable: viewsByDay !== null,
    current,
    previous,
    deltas: {
      revenue: delta(current.revenueCents, previous.revenueCents),
      orders: delta(current.orders, previous.orders),
      avgTicket:
        current.avgTicketCents !== null && previous.avgTicketCents !== null
          ? delta(current.avgTicketCents, previous.avgTicketCents)
          : null,
      conversion:
        current.conversion !== null && previous.conversion !== null ? delta(current.conversion * 100, previous.conversion * 100) : null,
      views: current.views !== null && previous.views !== null ? delta(current.views, previous.views) : null,
    },
    series,
    previousSeries,
    byGame: breakdown(gameRes.rows, 6),
    byCategory: breakdown(categoryRes.rows, 6),
    products,
    operations: toOps(win(opsRes.rows, "cur"), win(deliveryRes.rows, "cur")),
    previousOperations: toOps(win(opsRes.rows, "prev"), win(deliveryRes.rows, "prev")),
    buyers: {
      total: Number(buyerRow.buyers ?? 0),
      returning: Number(buyerRow.returning ?? 0),
      revenueCents: Number(buyerRow.revenue ?? 0),
      returningRevenueCents: Number(buyerRow.returning_revenue ?? 0),
    },
    releases: releaseRes.rows.map((r) => ({ day: r.day, count: Number(r.count), cents: Number(r.cents) })),
  }
}
