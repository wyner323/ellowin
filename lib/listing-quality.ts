import { attributeFieldsFor } from "@/lib/game-attributes"

/**
 * Nota de qualidade (0–100) de um anúncio já publicado, só com o que o vendedor controla: fotos, descrição,
 * título, jogo informado e os detalhes do jogo (rank, região...). É uma orientação para o vendedor completar
 * o anúncio, não um ranking nem uma promessa de venda: nada na vitrine ou na busca usa essa nota.
 * Puro (sem banco), para a tela e para os testes.
 */

export type QualityInput = {
  title: string
  description: string
  game: string | null
  categorySlug: string
  attributes: Record<string, string>
  imageCount: number
}

export type QualityTip = { key: string; text: string; points: number }

export type QualityLevel = "completo" | "bom" | "incompleto"

export type ListingQuality = {
  score: number
  level: QualityLevel
  /** O que ainda falta, do que mais pesa para o que menos pesa. */
  tips: QualityTip[]
}

export const QUALITY_POINTS = { photos: 30, description: 30, title: 20, game: 10, attributes: 10 } as const

export const QUALITY_LEVEL_LABEL: Record<QualityLevel, string> = {
  completo: "Anúncio completo",
  bom: "Anúncio bom",
  incompleto: "Anúncio incompleto",
}

function photoPoints(count: number) {
  if (count >= 3) return QUALITY_POINTS.photos
  if (count === 2) return 22
  if (count === 1) return 15
  return 0
}

function descriptionPoints(length: number) {
  if (length >= 300) return QUALITY_POINTS.description
  if (length >= 120) return 20
  if (length >= 20) return 10
  return 0
}

function titlePoints(length: number) {
  if (length >= 20) return QUALITY_POINTS.title
  if (length >= 8) return 10
  return 0
}

export function listingQuality(input: QualityInput): ListingQuality {
  const description = input.description.trim().length
  const title = input.title.trim().length
  const fields = attributeFieldsFor(input.game, input.categorySlug)
  const filled = fields.filter((f) => Boolean(input.attributes[f.key])).length

  const photos = photoPoints(input.imageCount)
  const desc = descriptionPoints(description)
  const titlePts = titlePoints(title)
  const game = input.game?.trim() ? QUALITY_POINTS.game : 0
  // Jogo sem campos próprios não tem o que preencher: não perde pontos por isso.
  const attrs = fields.length === 0 ? QUALITY_POINTS.attributes : Math.round((filled / fields.length) * QUALITY_POINTS.attributes)

  const score = photos + desc + titlePts + game + attrs

  const tips: QualityTip[] = []
  if (photos < QUALITY_POINTS.photos) {
    tips.push({
      key: "photos",
      points: QUALITY_POINTS.photos - photos,
      text: input.imageCount === 0 ? "Adicione fotos: quem vê o produto confia mais." : "Adicione mais fotos (3 ou mais mostram melhor o que será entregue).",
    })
  }
  if (desc < QUALITY_POINTS.description) {
    tips.push({
      key: "description",
      points: QUALITY_POINTS.description - desc,
      text: description < 120 ? "Detalhe a descrição: o que está incluído, como é a entrega e o que o comprador informa." : "Complete a descrição com mais detalhes (a partir de 300 caracteres).",
    })
  }
  if (titlePts < QUALITY_POINTS.title) {
    tips.push({ key: "title", points: QUALITY_POINTS.title - titlePts, text: "Use um título mais específico, com o jogo e o que é vendido (20+ caracteres)." })
  }
  if (game < QUALITY_POINTS.game) {
    tips.push({ key: "game", points: QUALITY_POINTS.game - game, text: "Informe o jogo ou a plataforma, para o anúncio aparecer na página dele." })
  }
  if (attrs < QUALITY_POINTS.attributes) {
    const missing = fields.filter((f) => !input.attributes[f.key]).map((f) => f.label.toLowerCase())
    tips.push({ key: "attributes", points: QUALITY_POINTS.attributes - attrs, text: `Informe ${missing.join(" e ")}: o comprador filtra por isso.` })
  }
  tips.sort((a, b) => b.points - a.points)

  return { score, level: score >= 80 ? "completo" : score >= 50 ? "bom" : "incompleto", tips }
}
