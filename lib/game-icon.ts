/**
 * Ícone próprio de cada jogo, sem usar a marca de ninguém: iniciais + uma cor derivada do nome.
 * Puro (sem React), para os testes poderem conferir que a regra é estável: o mesmo jogo tem sempre o mesmo ícone.
 */

// Palavras que não entram nas iniciais ("League of Legends" → LL, "Adventure Quest World" → AQ).
const SKIP_WORDS = new Set(["of", "the", "and", "de", "da", "do", "das", "dos", "e", "a", "o"])

export function gameInitials(name: string): string {
  const words = (name ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  const meaningful = words.filter((w) => !SKIP_WORDS.has(w.toLowerCase()))
  const pool = meaningful.length > 0 ? meaningful : words
  if (pool.length === 0) return "?"
  if (pool.length === 1) return pool[0].slice(0, 2).toUpperCase()
  return (pool[0][0] + pool[1][0]).toUpperCase()
}

/** FNV-1a de 32 bits: espalha bem nomes parecidos e não muda entre execuções. */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Matiz (0–359) do jogo, estável para o mesmo slug. */
export function gameHue(slug: string): number {
  return hash(slug) % 360
}

/** Fundo em degradê escuro com a cor do jogo; o texto branco por cima passa de 4,5:1 em qualquer matiz. */
export function gameIconBackground(slug: string): string {
  const hue = gameHue(slug)
  return `linear-gradient(135deg, oklch(0.5 0.15 ${hue}), oklch(0.36 0.13 ${(hue + 28) % 360}))`
}
