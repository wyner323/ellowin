type JsonLdProduct = {
  title: string
  description: string
  images: string[]
  rating: number | null
  ratingCount: number
  status: string
  variants: { priceCents: number; stock: number }[]
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
        }
      : undefined

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.title,
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
