import { DELIVERY_TIME_OPTIONS, INSTANT_DELIVERY_TIME } from "@/lib/delivery"
import { parseToCents } from "@/lib/money"

/**
 * Filtros e ordenação das listas de anúncios (/catalogo, /jogos, /busca).
 *
 * Tudo vive na URL (links compartilháveis, Voltar funciona) e é lido no
 * servidor. Este arquivo é puro: sem banco, para poder ser testado e importado
 * de qualquer lado.
 */

export const LISTING_PAGE_SIZE = 24

export const SORT_OPTIONS = [
  { value: "recentes", label: "Mais recentes" },
  { value: "menor-preco", label: "Menor preço" },
  { value: "maior-preco", label: "Maior preço" },
  { value: "avaliados", label: "Melhor avaliados" },
  { value: "vendidos", label: "Mais vendidos" },
] as const

export type ListingSort = (typeof SORT_OPTIONS)[number]["value"]

export const DELIVERY_FILTER_OPTIONS = [
  { value: "qualquer", label: "Qualquer prazo" },
  { value: "imediata", label: "Entrega imediata" },
  { value: "24h", label: "Até 24 horas" },
] as const

export type DeliveryFilter = (typeof DELIVERY_FILTER_OPTIONS)[number]["value"]

/** Níveis de vendedor existentes: 1 (todos) a 5. */
export const MAX_SELLER_LEVEL = 5

/** Teto aceito num campo de preço, só para barrar lixo digitado (R$ 1.000.000). */
const MAX_PRICE_CENTS = 100_000_000

export type ListingFilters = {
  sort: ListingSort
  minPriceCents: number | null
  maxPriceCents: number | null
  delivery: DeliveryFilter
  /** 1 = sem filtro. */
  minLevel: number
  onlyReviewed: boolean
}

export const DEFAULT_LISTING_FILTERS: ListingFilters = {
  sort: "recentes",
  minPriceCents: null,
  maxPriceCents: null,
  delivery: "qualquer",
  minLevel: 1,
  onlyReviewed: false,
}

type RawParams = Record<string, string | string[] | undefined>

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw
}

function parsePrice(raw: string | string[] | undefined): number | null {
  const value = first(raw)
  if (!value || value.length > 14) return null
  const cents = parseToCents(value)
  if (cents === null || cents > MAX_PRICE_CENTS) return null
  return cents
}

export function parseListingFilters(params: RawParams): ListingFilters {
  const sortRaw = first(params.ordem)
  const sort =
    SORT_OPTIONS.find((o) => o.value === sortRaw)?.value ?? DEFAULT_LISTING_FILTERS.sort

  const deliveryRaw = first(params.entrega)
  const delivery =
    DELIVERY_FILTER_OPTIONS.find((o) => o.value === deliveryRaw)?.value ??
    DEFAULT_LISTING_FILTERS.delivery

  const levelRaw = first(params.nivel)
  const level = levelRaw && /^\d$/.test(levelRaw) ? Number(levelRaw) : 1
  const minLevel = Math.min(Math.max(level, 1), MAX_SELLER_LEVEL)

  let minPriceCents = parsePrice(params.min)
  let maxPriceCents = parsePrice(params.max)
  // Faixa invertida (min > max) é erro de digitação comum: troca em vez de zerar a lista.
  if (minPriceCents !== null && maxPriceCents !== null && minPriceCents > maxPriceCents) {
    ;[minPriceCents, maxPriceCents] = [maxPriceCents, minPriceCents]
  }

  return {
    sort,
    minPriceCents,
    maxPriceCents,
    delivery,
    minLevel,
    onlyReviewed: first(params.avaliados) === "1",
  }
}

/** Filtros que restringem a lista (a ordenação não conta). */
export function activeFilterCount(f: ListingFilters): number {
  return (
    (f.minPriceCents !== null || f.maxPriceCents !== null ? 1 : 0) +
    (f.delivery !== "qualquer" ? 1 : 0) +
    (f.minLevel > 1 ? 1 : 0) +
    (f.onlyReviewed ? 1 : 0)
  )
}

/** Vitrine "limpa": sem filtro e na ordem padrão. Só nela os anúncios de demonstração entram. */
export function isDefaultView(f: ListingFilters): boolean {
  return activeFilterCount(f) === 0 && f.sort === DEFAULT_LISTING_FILTERS.sort
}

function centsToParam(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",")
}

/** Parâmetros de URL (sem os valores padrão) para links de paginação e "limpar". */
export function filtersToParams(f: ListingFilters): Record<string, string | undefined> {
  return {
    ordem: f.sort !== DEFAULT_LISTING_FILTERS.sort ? f.sort : undefined,
    min: f.minPriceCents !== null ? centsToParam(f.minPriceCents) : undefined,
    max: f.maxPriceCents !== null ? centsToParam(f.maxPriceCents) : undefined,
    entrega: f.delivery !== "qualquer" ? f.delivery : undefined,
    nivel: f.minLevel > 1 ? String(f.minLevel) : undefined,
    avaliados: f.onlyReviewed ? "1" : undefined,
  }
}

/**
 * A janela de uma página sobre a lista "reais, depois demonstração": quantos
 * reais buscar no banco (e a partir de onde) e onde começa a fatia de demonstração.
 */
export function listingWindow(realTotal: number, offset: number, limit: number) {
  return {
    realOffset: Math.min(offset, realTotal),
    realLimit: Math.max(0, Math.min(limit, realTotal - offset)),
    demoStart: Math.max(0, offset - realTotal),
  }
}

/** Prazos em texto livre de anúncios criados antes do conjunto fechado de `lib/delivery.ts`. */
const LEGACY_FAST_DELIVERY_TIMES = ["imediata", "ate 2h", "ate 6h", "ate 12h", "ate 24h"]

/**
 * Como o filtro de prazo vira condição: `automatic` (a entrega é automática,
 * lido de `product.deliveryType`, que é confiável) e/ou os rótulos de
 * `product.deliveryTime` aceitos. `null` = sem filtro.
 */
export function deliveryRuleFor(
  filter: DeliveryFilter,
): { automatic: true; labels: string[] } | null {
  if (filter === "qualquer") return null
  if (filter === "imediata") return { automatic: true, labels: [] }
  return {
    automatic: true,
    labels: [
      INSTANT_DELIVERY_TIME,
      ...DELIVERY_TIME_OPTIONS.filter((o) => o.hours <= 24).map((o) => o.label),
      ...LEGACY_FAST_DELIVERY_TIMES,
    ],
  }
}
