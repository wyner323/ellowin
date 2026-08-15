import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  product,
  productImage,
  productVariant,
  review,
  sellerApplication,
  user,
} from "@/lib/db/schema"
import { getCategory, listings as demoListings } from "@/lib/catalog"

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

/** Produtos reais ativos, com preço mínimo e nome da loja. */
async function getRealCards(filters: {
  categorySlug?: string
  query?: string
}): Promise<StorefrontCard[]> {
  const conditions = [eq(product.status, "ativo")]

  if (filters.categorySlug) {
    conditions.push(eq(product.categorySlug, filters.categorySlug))
  }

  if (filters.query) {
    const term = `%${filters.query.toLowerCase()}%`
    conditions.push(
      sql`(lower(${product.title}) like ${term} or lower(coalesce(${product.game}, '')) like ${term})`,
    )
  }

  const rows = await db
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
      sellerName: user.name,
      storeName: sellerApplication.storeName,
      sellerLevel: sellerApplication.level,
      minPrice: sql<number>`(
        select min(v."priceCents") from "product_variant" v
        where v."productId" = ${product.id} and v."active" = true and v."stock" > 0
      )`,
      coverUrl: sql<string | null>`(
        select img."url" from "product_image" img
        where img."productId" = ${product.id}
        order by img."sortOrder" asc, img."id" asc limit 1
      )`,
    })
    .from(product)
    .leftJoin(user, eq(user.id, product.sellerId))
    .leftJoin(sellerApplication, eq(sellerApplication.userId, product.sellerId))
    .where(and(...conditions))
    .orderBy(desc(product.createdAt))

  return rows
    .filter((r) => r.minPrice !== null)
    .map((r) => ({
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
    }))
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
      sellerName: user.name,
      storeName: sellerApplication.storeName,
      sellerLevel: sellerApplication.level,
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
      buyerName: user.name,
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
