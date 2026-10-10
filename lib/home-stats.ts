/**
 * Números públicos da home e das categorias.
 *
 * Regra: só exibir número que o banco sustenta. Nota média e prazo médio de
 * entrega só aparecem com volume suficiente — com 7 avaliações, "4,3/5" é um
 * dado frágil e vira propaganda. Sem volume, o espaço simplesmente não é usado.
 */

export const MIN_REVIEWS_FOR_RATING = 20
export const MIN_DELIVERIES_FOR_SPEED = 20

export type MarketStats = {
  /** Anúncios ativos com pelo menos uma variante à venda (a mesma regra da vitrine). */
  activeListings: number
  approvedSellers: number
  reviewCount: number
  ratingAvg: number | null
  /** Pedidos concluídos com entrega registrada, fora a carga de demonstração. */
  deliveredOrders: number
  avgDeliveryMinutes: number | null
}

export type HeroStat = { value: string; label: string }

const nf = new Intl.NumberFormat("pt-BR")

/** 45 → "45 min", 300 → "5 h", 4320 → "3 dias". */
export function formatDeliveryAverage(minutes: number): string {
  if (minutes < 90) return `${Math.max(1, Math.round(minutes))} min`
  const hours = minutes / 60
  if (hours < 48) return `${Math.round(hours)} h`
  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? "dia" : "dias"}`
}

export function formatRatingAverage(avg: number): string {
  return `${avg.toFixed(1).replace(".", ",")}/5`
}

export function buildHeroStats(s: MarketStats): HeroStat[] {
  const stats: HeroStat[] = []

  if (s.activeListings > 0)
    stats.push({
      value: nf.format(s.activeListings),
      label: s.activeListings === 1 ? "anúncio ativo" : "anúncios ativos",
    })

  if (s.approvedSellers > 0)
    stats.push({
      value: nf.format(s.approvedSellers),
      label: s.approvedSellers === 1 ? "vendedor aprovado" : "vendedores aprovados",
    })

  if (s.ratingAvg !== null && s.reviewCount >= MIN_REVIEWS_FOR_RATING)
    stats.push({ value: formatRatingAverage(s.ratingAvg), label: "avaliação média" })
  else if (s.avgDeliveryMinutes !== null && s.deliveredOrders >= MIN_DELIVERIES_FOR_SPEED)
    stats.push({ value: formatDeliveryAverage(s.avgDeliveryMinutes), label: "entrega média" })

  return stats
}

export type CategoryStat = { count: number; minPriceCents: number }

/** Texto do rodapé do card de categoria: contagem real, ou "Novo" quando ainda não há anúncio. */
export function categoryCardInfo(stat: CategoryStat | undefined): {
  countLabel: string
  fromCents: number | null
} {
  if (!stat || stat.count < 1) return { countLabel: "Novo na Ellowin", fromCents: null }
  return {
    countLabel: `${nf.format(stat.count)} ${stat.count === 1 ? "anúncio" : "anúncios"}`,
    fromCents: stat.minPriceCents,
  }
}
