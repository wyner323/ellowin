/**
 * Cor de destaque escolhível pelo usuário — usada no anel do avatar e na loja
 * pública do vendedor. Um conjunto fixo (em vez de cor livre) garante que tudo
 * continue legível nos dois temas.
 */
export const ACCENT_COLORS = {
  padrao: { label: "Padrão", hex: null },
  azul: { label: "Azul", hex: "#3B82F6" },
  verde: { label: "Verde", hex: "#22C55E" },
  ambar: { label: "Âmbar", hex: "#F59E0B" },
  rosa: { label: "Rosa", hex: "#EC4899" },
  ciano: { label: "Ciano", hex: "#06B6D4" },
} as const

export type AccentColorId = keyof typeof ACCENT_COLORS

export function isValidAccentColor(value: string): value is AccentColorId {
  return value in ACCENT_COLORS
}

/** Hex da cor, ou null quando é a cor padrão da marca (usa --primary do tema). */
export function accentColorHex(id: string | null | undefined): string | null {
  if (!id || !isValidAccentColor(id)) return null
  return ACCENT_COLORS[id].hex
}
