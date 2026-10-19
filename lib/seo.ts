import { formatCents } from "@/lib/money"
import { SITE_URL } from "@/lib/site"

/**
 * Pedaços de SEO que não dependem de banco nem de React, para os testes conferirem o texto que o Google vê.
 * Regra de ouro: o que aparece aqui precisa ser verdade para o sistema (nada de "garantia" ou "entrega em minutos").
 */

const MAX_TITLE_CHARS = 42

function squash(text: string) {
  return (text ?? "").replace(/\s+/g, " ").trim()
}

function truncate(text: string, max: number) {
  const clean = squash(text)
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** Título e descrição da página de um anúncio. O preço no título aumenta o clique no resultado do Google. */
export function productSeo(item: {
  title: string
  game: string | null
  description: string
  variants: { priceCents: number; stock: number }[]
}) {
  const available = item.variants.filter((v) => v.stock > 0)
  const pool = available.length > 0 ? available : item.variants
  const prices = pool.map((v) => v.priceCents)
  const min = prices.length ? Math.min(...prices) : null
  const hasRange = prices.length > 1 && Math.max(...prices) !== Math.min(...prices)

  const base = truncate(item.title, MAX_TITLE_CHARS)
  const title =
    min === null ? `${base} | Ellowin` : `${base} ${hasRange ? "a partir de" : "por"} ${formatCents(min)} | Ellowin`

  const intro = truncate(item.description, 105)
  const tail = "Pagamento protegido: o vendedor só recebe depois que você confirma."
  const description = squash(`${intro} ${tail}`)

  return { title, description }
}

/** schema.org/BreadcrumbList: o Google troca a URL do resultado pelo caminho (Início > Jogos > Valorant). */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  }
}

/** Organização e caixa de busca do site (habilita a busca direta no resultado da marca). */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Ellowin",
        url: SITE_URL,
        logo: `${SITE_URL}/icon-32x32.png`,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "Ellowin",
        inLanguage: "pt-BR",
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/busca?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  }
}
