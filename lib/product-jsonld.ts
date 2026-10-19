type JsonLdProduct = {
  title: string
  description: string
  images: string[]
  rating: number | null
  ratingCount: number
  status: string
  variants: { label?: string; priceCents: number; stock: number }[]
  /** Opcionais: enriquecem o resultado do Google quando existem. */
  id?: number
  game?: string | null
  categoryName?: string
  sellerName?: string
}

/** Dados estruturados (schema.org/Product) para o Google mostrar preço e nota no resultado. */
export function buildProductJsonLd(item: JsonLdProduct, url: string, fallbackImage: string) {
  const prices = item.variants.map((v) => v.priceCents / 100)
  const inStock = item.status === "ativo" && item.variants.some((v) => v.stock > 0)

  const offers =
    prices.length > 0
      ? {
          "@type": "AggregateOffer",
          priceCurrency: "BRL",
          lowPrice: Math.min(...prices).toFixed(2),
          highPrice: Math.max(...prices).toFixed(2),
          offerCount: prices.length,
          availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          url,
          // Uma oferta por variante: o Google mostra cada opção com o próprio preço.
          offers: item.variants.map((v) => ({
            "@type": "Offer",
            ...(v.label ? { name: v.label } : {}),
            price: (v.priceCents / 100).toFixed(2),
            priceCurrency: "BRL",
            availability:
              item.status === "ativo" && v.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            url,
            ...(item.sellerName ? { seller: { "@type": "Organization", name: item.sellerName } } : {}),
          })),
        }
      : undefined

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.title,
    ...(item.id !== undefined ? { sku: `ellowin-${item.id}` } : {}),
    ...(item.game ? { brand: { "@type": "Brand", name: item.game } } : {}),
    ...(item.categoryName ? { category: item.categoryName } : {}),
    description: item.description.slice(0, 300),
    image: item.images.length > 0 ? item.images : [fallbackImage],
    url,
    offers,
    ...(item.rating !== null && item.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: item.rating.toFixed(1),
            reviewCount: item.ratingCount,
          },
        }
      : {}),
  }
}

/** JSON seguro para dentro de <script>: título e descrição vêm do vendedor, então `<` é escapado. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
