/**
 * Textos curtos dos cards de anúncio. Puro: o card só formata o que o banco
 * já entregou, sem inventar número.
 */

/** Abaixo disso, "% positivas" é frágil (1 avaliação seria 100%), então não aparece. */
export const MIN_REVIEWS_FOR_POSITIVE_PCT = 5

/** Estoque até aqui vira aviso de "últimas unidades". */
export const LOW_STOCK_THRESHOLD = 5

export function positivePercent(positive: number, total: number): number | null {
  if (total < MIN_REVIEWS_FOR_POSITIVE_PCT) return null
  return Math.round((Math.min(positive, total) / total) * 100)
}

/** `null` quando o estoque é folgado, desconhecido (demonstração) ou zerado. */
export function stockHint(stock: number | null): string | null {
  if (stock === null || stock <= 0 || stock > LOW_STOCK_THRESHOLD) return null
  return stock === 1 ? "Última unidade" : `Últimas ${stock} unidades`
}
