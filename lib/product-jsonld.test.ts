import { describe, expect, it } from "vitest"
import { buildProductJsonLd, serializeJsonLd } from "@/lib/product-jsonld"

const base = {
  title: "Conta Valorant",
  description: "Descrição",
  images: ["https://x.public.blob.vercel-storage.com/a.webp"],
  rating: 4.5,
  ratingCount: 10,
  status: "ativo",
  variants: [
    { priceCents: 10000, stock: 1 },
    { priceCents: 150000, stock: 0 },
  ],
}

describe("buildProductJsonLd", () => {
  it("resume o intervalo de preço em reais e a disponibilidade", () => {
    const ld = buildProductJsonLd(base, "https://ellowin.com.br/produtos/x", "/fallback.png")
    expect(ld.offers).toMatchObject({
      priceCurrency: "BRL",
      lowPrice: "100.00",
      highPrice: "1500.00",
      offerCount: 2,
      availability: "https://schema.org/InStock",
    })
  })

  it("marca sem estoque quando pausado ou esgotado", () => {
    const paused = buildProductJsonLd({ ...base, status: "pausado" }, "u", "/f.png")
    expect(paused.offers?.availability).toBe("https://schema.org/OutOfStock")
    const soldOut = buildProductJsonLd(
      { ...base, variants: [{ priceCents: 500, stock: 0 }] },
      "u",
      "/f.png",
    )
    expect(soldOut.offers?.availability).toBe("https://schema.org/OutOfStock")
  })

  it("só inclui nota quando há avaliações", () => {
    expect(buildProductJsonLd(base, "u", "/f.png")).toHaveProperty("aggregateRating")
    expect(
      buildProductJsonLd({ ...base, rating: null, ratingCount: 0 }, "u", "/f.png"),
    ).not.toHaveProperty("aggregateRating")
  })

  it("usa a imagem de reserva quando o anúncio não tem fotos", () => {
    expect(buildProductJsonLd({ ...base, images: [] }, "u", "/f.png").image).toEqual(["/f.png"])
  })
})

describe("serializeJsonLd", () => {
  it("escapa < para não fechar o <script> com texto do vendedor", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" })
    expect(out).not.toContain("</script>")
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>")
  })
})
