import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  dispute,
  order,
  product,
  productImage,
  productVariant,
  review,
  sellerApplication,
  user,
} from "@/lib/db/schema"
import { getCategory, listings as demoListings } from "@/lib/catalog"
import { computeSellerBadges } from "@/lib/badges"
import { slugifyGame } from "@/lib/product-catalog"

/**
 * Leitura da vitrine.
 *
 * A vitrine mistura duas fontes: os anúncios de demonstração fixos em
 * `lib/catalog.ts` e os produtos reais cadastrados por vendedores. Só os reais
 * são clicáveis, porque só eles têm variantes, estoque e fluxo de compra.
 */

export type StorefrontCard = {
  key: string
  source: "demo" | "real"
  title: string
  categorySlug: string
  game: string | null
  /** Menor preço entre as variantes ativas. */
  priceCents: number
  delivery: string
  /** Capa do anúncio. Sem foto, cai na imagem da categoria. */
  imageUrl: string
  href: string | null
  seller: {
    name: string
    level: number
    rating: number | null
    sales: number
  }
}

/** Imagem da categoria, usada como fallback quando o anúncio não tem foto. */
function categoryImage(slug: string): string {
  return getCategory(slug)?.image ?? "/placeholder.svg"
}

function demoToCard(l: (typeof demoListings)[number]): StorefrontCard {
  return {
    key: `demo-${l.id}`,
    source: "demo",
    title: l.title,
    categorySlug: l.category,
    game: l.game,
    priceCents: Math.round(l.price * 100),
    delivery: l.delivery,
    imageUrl: categoryImage(l.category),
    href: null,
    seller: {
      name: l.seller.name,
      level: l.seller.level,
      rating: l.seller.rating,
      sales: l.seller.sales,
    },
  }
}

/** Query base dos anúncios reais ativos — preço mínimo, capa e loja do vendedor. */
function activeRealProductsQuery(extraConditions: SQL[] = []) {
  return db
    .select({
      id: product.id,
      slug: product.slug,
      title: product.title,
      categorySlug: product.categorySlug,
      game: product.game,
      deliveryTime: product.deliveryTime,
      ratingSum: product.ratingSum,
      ratingCount: product.ratingCount,
      salesCount: product.salesCount,
      sellerId: product.sellerId,
      sellerName: sql<string>`coalesce(${user.displayName}, ${user.name})`,
      storeName: sellerApplication.storeName,
      sellerLevel: sellerApplication.level,
      // Correlaciona com `"product"."id"` por texto, não interpolando
      // `product.id` — o Drizzle renderiza um Column interpolado aqui sem
      // qualificador de tabela, e como a subquery também tem uma coluna
      // "id" (a da própria variante/imagem), o Postgres resolvia pro escopo
      // errado (comparava a variante com o próprio id dela, nunca batendo).
      minPrice: sql<number>`(
        select min(v."priceCents") from "product_variant" v
        where v."productId" = "product"."id" and v."active" = true and v."stock" > 0
      )`,
      coverUrl: sql<string | null>`(
        select img."url" from "product_image" img
        where img."productId" = "product"."id"
        order by img."sortOrder" asc, img."id" asc limit 1
      )`,
    })
    .from(product)
    .leftJoin(user, eq(user.id, product.sellerId))
    .leftJoin(sellerApplication, eq(sellerApplication.userId, product.sellerId))
    .where(and(eq(product.status, "ativo"), ...extraConditions))
    .orderBy(desc(product.createdAt))
}

type ActiveRealProductRow = Awaited<ReturnType<typeof activeRealProductsQuery>>[number]

function realRowToCard(r: ActiveRealProductRow): StorefrontCard {
  return {
    key: `real-${r.id}`,
    source: "real" as const,
    title: r.title,
    categorySlug: r.categorySlug,
    game: r.game,
    priceCents: Number(r.minPrice),
    delivery: r.deliveryTime,
    imageUrl: r.coverUrl ?? categoryImage(r.categorySlug),
    href: `/produtos/${r.slug}`,
    seller: {
      name: r.storeName ?? r.sellerName ?? "Vendedor Ellowin",
      level: r.sellerLevel ?? 1,
      rating: r.ratingCount > 0 ? Math.round((r.ratingSum / r.ratingCount) * 10) / 10 : null,
      sales: r.salesCount,
    },
  }
}

/** Produtos reais ativos, com preço mínimo e nome da loja. */
async function getRealCards(filters: {
  categorySlug?: string
  query?: string
}): Promise<StorefrontCard[]> {
  const conditions: SQL[] = []

  if (filters.categorySlug) {
    conditions.push(eq(product.categorySlug, filters.categorySlug))
  }

  if (filters.query) {
    const term = `%${filters.query.toLowerCase()}%`
    conditions.push(
      sql`(lower(${product.title}) like ${term} or lower(coalesce(${product.game}, '')) like ${term})`,
    )
  }

  const rows = await activeRealProductsQuery(conditions)
  return rows.filter((r) => r.minPrice !== null).map(realRowToCard)
}

/** Produtos reais primeiro, anúncios de demonstração depois. */
export async function getStorefrontCards(filters: {
  categorySlug?: string
  query?: string
} = {}): Promise<StorefrontCard[]> {
  const real = await getRealCards(filters)

  let demo = demoListings.map(demoToCard)

  if (filters.categorySlug) {
    demo = demo.filter((d) => d.categorySlug === filters.categorySlug)
  }

  if (filters.query) {
    const term = filters.query.toLowerCase()
    demo = demo.filter(
      (d) =>
        d.title.toLowerCase().includes(term) ||
        (d.game ?? "").toLowerCase().includes(term),
    )
  }

  return [...real, ...demo]
}

export type ProductDetail = {
  id: number
  slug: string
  title: string
  categorySlug: string
  game: string | null
  description: string
  deliveryType: string
  deliveryTime: string
  status: string
  salesCount: number
  rating: number | null
  ratingCount: number
  /** Fotos do anúncio, capa primeiro. Vazio quando o vendedor não subiu nenhuma. */
  images: string[]
  seller: {
    id: string
    name: string
    level: number
    storeSlug: string | null
  }
  variants: {
    id: number
    label: string
    priceCents: number
    stock: number
    deliveryNote: string | null
  }[]
  reviews: {
    id: number
    rating: number
    comment: string | null
    createdAt: Date
    buyerName: string
  }[]
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const [row] = await db
    .select({
      id: product.id,
      slug: product.slug,
      title: product.title,
      categorySlug: product.categorySlug,
      game: product.game,
      description: product.description,
      deliveryType: product.deliveryType,
      deliveryTime: product.deliveryTime,
      status: product.status,
      salesCount: product.salesCount,
      ratingSum: product.ratingSum,
      ratingCount: product.ratingCount,
      sellerId: product.sellerId,
      sellerName: sql<string>`coalesce(${user.displayName}, ${user.name})`,
      storeName: sellerApplication.storeName,
      storeSlug: sellerApplication.storeSlug,
      sellerLevel: sellerApplication.level,
      sellerStatus: sellerApplication.status,
    })
    .from(product)
    .leftJoin(user, eq(user.id, product.sellerId))
    .leftJoin(sellerApplication, eq(sellerApplication.userId, product.sellerId))
    .where(eq(product.slug, slug))
    .limit(1)

  if (!row) return null

  const variants = await db
    .select()
    .from(productVariant)
    .where(and(eq(productVariant.productId, row.id), eq(productVariant.active, true)))
    .orderBy(asc(productVariant.sortOrder), asc(productVariant.id))

  const imageRows = await db
    .select({ url: productImage.url })
    .from(productImage)
    .where(eq(productImage.productId, row.id))
    .orderBy(asc(productImage.sortOrder), asc(productImage.id))

  const reviewRows = await db
    .select({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      buyerName: sql<string>`coalesce(${user.displayName}, ${user.name})`,
    })
    .from(review)
    .leftJoin(user, eq(user.id, review.buyerId))
    .where(eq(review.productId, row.id))
    .orderBy(desc(review.createdAt))
    .limit(20)

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    categorySlug: row.categorySlug,
    game: row.game,
    description: row.description,
    deliveryType: row.deliveryType,
    deliveryTime: row.deliveryTime,
    status: row.status,
    salesCount: row.salesCount,
    rating:
      row.ratingCount > 0
        ? Math.round((row.ratingSum / row.ratingCount) * 10) / 10
        : null,
    ratingCount: row.ratingCount,
    images: imageRows.map((i) => i.url),
    seller: {
      id: row.sellerId,
      name: row.storeName ?? row.sellerName ?? "Vendedor Ellowin",
      level: row.sellerLevel ?? 1,
      storeSlug: row.sellerStatus === "aprovado" ? row.storeSlug : null,
    },
    variants: variants.map((v) => ({
      id: v.id,
      label: v.label,
      priceCents: v.priceCents,
      stock: v.stock,
      deliveryNote: v.deliveryNote,
    })),
    reviews: reviewRows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      buyerName: r.buyerName ?? "Comprador",
    })),
  }
}

/** Nota média e volume de vendas de um vendedor — o ranking de qualidade. */
export async function getSellerStats(sellerId: string) {
  const [row] = await db
    .select({
      ratingSum: sql<number>`coalesce(sum(${product.ratingSum}), 0)`,
      ratingCount: sql<number>`coalesce(sum(${product.ratingCount}), 0)`,
      salesCount: sql<number>`coalesce(sum(${product.salesCount}), 0)`,
      products: sql<number>`count(*)`,
    })
    .from(product)
    .where(eq(product.sellerId, sellerId))

  const ratingCount = Number(row?.ratingCount ?? 0)
  const ratingSum = Number(row?.ratingSum ?? 0)

  return {
    rating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
    ratingCount,
    salesCount: Number(row?.salesCount ?? 0),
    products: Number(row?.products ?? 0),
  }
}

export async function getSellerProducts(sellerId: string) {
  const rows = await db
    .select()
    .from(product)
    .where(eq(product.sellerId, sellerId))
    .orderBy(desc(product.createdAt))

  if (rows.length === 0) return []

  const productIds = rows.map((r) => r.id)

  const variants = await db
    .select()
    .from(productVariant)
    .where(inArray(productVariant.productId, productIds))
    .orderBy(asc(productVariant.sortOrder), asc(productVariant.id))

  const imageRows = await db
    .select()
    .from(productImage)
    .where(inArray(productImage.productId, productIds))
    .orderBy(asc(productImage.sortOrder), asc(productImage.id))

  return rows.map((p) => ({
    ...p,
    rating:
      p.ratingCount > 0 ? Math.round((p.ratingSum / p.ratingCount) * 10) / 10 : null,
    variants: variants.filter((v) => v.productId === p.id),
    coverUrl: imageRows.find((i) => i.productId === p.id)?.url ?? null,
  }))
}

export async function getProductForSeller(sellerId: string, productId: number) {
  const [row] = await db
    .select()
    .from(product)
    .where(and(eq(product.id, productId), eq(product.sellerId, sellerId)))
    .limit(1)

  if (!row) return null

  const variants = await db
    .select()
    .from(productVariant)
    .where(eq(productVariant.productId, row.id))
    .orderBy(asc(productVariant.sortOrder), asc(productVariant.id))

  const imageRows = await db
    .select({ url: productImage.url })
    .from(productImage)
    .where(eq(productImage.productId, row.id))
    .orderBy(asc(productImage.sortOrder), asc(productImage.id))

  return { ...row, variants, images: imageRows.map((i) => i.url) }
}

export type SellerStorefront = Awaited<ReturnType<typeof getSellerStorefront>>

/**
 * Loja pública de um vendedor aprovado — perfil + vitrine de anúncios ativos.
 * `slug` é comparado sem diferenciar maiúsculas (é assim que o índice único
 * do banco também trata).
 */
export async function getSellerStorefront(slug: string) {
  const [row] = await db
    .select({
      sellerId: sellerApplication.userId,
      storeName: sellerApplication.storeName,
      level: sellerApplication.level,
      status: sellerApplication.status,
      displayName: user.displayName,
      name: user.name,
      image: user.image,
      bio: user.bio,
      bannerUrl: user.bannerUrl,
      accentColor: user.accentColor,
      memberSince: user.createdAt,
    })
    .from(sellerApplication)
    .innerJoin(user, eq(user.id, sellerApplication.userId))
    .where(sql`lower(${sellerApplication.storeSlug}) = lower(${slug})`)
    .limit(1)

  if (!row || row.status !== "aprovado") return null

  const [stats, disputeRow] = await Promise.all([
    getSellerStats(row.sellerId),
    db
      .select({ count: sql<number>`count(*)` })
      .from(dispute)
      .innerJoin(order, eq(order.id, dispute.orderId))
      .where(eq(order.sellerId, row.sellerId)),
  ])

  const activeProducts = await db
    .select({
      id: product.id,
      slug: product.slug,
      title: product.title,
      categorySlug: product.categorySlug,
      game: product.game,
      deliveryTime: product.deliveryTime,
      ratingSum: product.ratingSum,
      ratingCount: product.ratingCount,
      // Ver o comentário equivalente em activeRealProductsQuery: correlaciona
      // por texto ("product"."id"), não interpolando o Column do Drizzle.
      minPrice: sql<number>`(
        select min(v."priceCents") from "product_variant" v
        where v."productId" = "product"."id" and v."active" = true and v."stock" > 0
      )`,
      coverUrl: sql<string | null>`(
        select img."url" from "product_image" img
        where img."productId" = "product"."id"
        order by img."sortOrder" asc, img."id" asc limit 1
      )`,
    })
    .from(product)
    .where(and(eq(product.sellerId, row.sellerId), eq(product.status, "ativo")))
    .orderBy(desc(product.createdAt))

  const disputesCount = Number(disputeRow[0]?.count ?? 0)

  return {
    sellerId: row.sellerId,
    name: row.storeName ?? row.displayName ?? row.name,
    image: row.image,
    bio: row.bio,
    bannerUrl: row.bannerUrl,
    accentColor: row.accentColor,
    level: row.level,
    memberSince: row.memberSince,
    stats,
    badges: computeSellerBadges({ ...stats, disputesCount }),
    products: activeProducts
      .filter((p) => p.minPrice !== null)
      .map((p) => ({
        key: `real-${p.id}`,
        source: "real" as const,
        title: p.title,
        categorySlug: p.categorySlug,
        game: p.game,
        priceCents: Number(p.minPrice),
        delivery: p.deliveryTime,
        imageUrl: p.coverUrl ?? categoryImage(p.categorySlug),
        href: `/produtos/${p.slug}`,
        seller: { name: row.storeName ?? row.displayName ?? row.name, level: row.level, rating: stats.rating, sales: stats.salesCount },
      })),
  }
}

/* ---------------------------------------------------------------------------
 * Navegação por jogo (`/jogos`) — reaproveita o catálogo de `lib/product-catalog`.
 * `product.game` é texto livre, então o cruzamento com o slug do jogo é feito
 * em JS (via `slugifyGame`), não em SQL — assim anúncios antigos continuam
 * aparecendo certo sem precisar de migração.
 * ------------------------------------------------------------------------ */

/** Quantidade de anúncios ativos por jogo, para o índice `/jogos`. */
export async function getGameListingCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({ game: product.game })
    .from(product)
    .where(and(eq(product.status, "ativo"), sql`${product.game} is not null`))

  const counts: Record<string, number> = {}
  for (const row of rows) {
    if (!row.game) continue
    const slug = slugifyGame(row.game)
    counts[slug] = (counts[slug] ?? 0) + 1
  }
  return counts
}

/** Anúncios ativos de um jogo específico, para `/jogos/[slug]`. */
export async function getListingsByGame(gameSlug: string): Promise<StorefrontCard[]> {
  const rows = await activeRealProductsQuery()
  return rows
    .filter((r) => r.minPrice !== null && r.game && slugifyGame(r.game) === gameSlug)
    .map(realRowToCard)
}
