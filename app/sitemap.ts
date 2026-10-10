import type { MetadataRoute } from "next"
import { eq } from "drizzle-orm"
import { categories } from "@/lib/catalog"
import { db } from "@/lib/db"
import { product } from "@/lib/db/schema"
import { GAMES } from "@/lib/product-catalog"
import { SITE_URL } from "@/lib/site"

/**
 * Gerado no build/deploy (não por requisição): páginas fixas, cada categoria do
 * catálogo, cada jogo do catálogo estático e os anúncios REAIS ativos (nunca os
 * de demonstração, que não têm página própria — ver lib/catalog.ts).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const activeProducts = await db
    .select({ slug: product.slug, updatedAt: product.updatedAt })
    .from(product)
    .where(eq(product.status, "ativo"))

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/jogos`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/busca`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/vender`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/ajuda`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/verificador`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/termos`, changeFrequency: "yearly", priority: 0.3 },
  ]

  const categoryPages: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${SITE_URL}/catalogo/${c.slug}`,
    changeFrequency: "daily",
    priority: 0.7,
  }))

  const gamePages: MetadataRoute.Sitemap = GAMES.map((g) => ({
    url: `${SITE_URL}/jogos/${g.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }))

  const productPages: MetadataRoute.Sitemap = activeProducts.map((p) => ({
    url: `${SITE_URL}/produtos/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "daily",
    priority: 0.6,
  }))

  return [...staticPages, ...categoryPages, ...gamePages, ...productPages]
}
