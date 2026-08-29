import { Award, Package, ShieldCheck, Star, Trophy, type LucideIcon } from "lucide-react"

/**
 * Selos de confiança do vendedor, calculados a partir de dados que já
 * existem (vendas, nota, disputas) — nada fica salvo, é sempre recalculado.
 */
export type BadgeId = "vendas_10" | "vendas_50" | "vendas_100" | "vendas_500" | "bem_avaliado" | "sem_disputas"

export const BADGE_META: Record<BadgeId, { label: string; icon: LucideIcon }> = {
  vendas_10: { label: "10+ vendas", icon: Package },
  vendas_50: { label: "50+ vendas", icon: Package },
  vendas_100: { label: "100+ vendas", icon: Award },
  vendas_500: { label: "500+ vendas", icon: Trophy },
  bem_avaliado: { label: "Muito bem avaliado", icon: Star },
  sem_disputas: { label: "Sem disputas", icon: ShieldCheck },
}

export function computeSellerBadges(input: {
  salesCount: number
  rating: number | null
  ratingCount: number
  disputesCount: number
}): BadgeId[] {
  const badges: BadgeId[] = []

  if (input.salesCount >= 500) badges.push("vendas_500")
  else if (input.salesCount >= 100) badges.push("vendas_100")
  else if (input.salesCount >= 50) badges.push("vendas_50")
  else if (input.salesCount >= 10) badges.push("vendas_10")

  if (input.rating !== null && input.rating >= 4.8 && input.ratingCount >= 5) {
    badges.push("bem_avaliado")
  }

  if (input.salesCount >= 5 && input.disputesCount === 0) {
    badges.push("sem_disputas")
  }

  return badges
}
