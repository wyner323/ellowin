import { GAMES } from "@/lib/product-catalog"

/**
 * Sugestões de jogo enquanto a pessoa digita na busca. Puro e sem banco: usa só
 * o catálogo estático de jogos, então responde na hora e não pesa no servidor.
 */

export const MIN_SUGGEST_LENGTH = 2
export const MAX_SUGGESTIONS = 8

/** Minúsculas, sem acento e sem pontuação: "Counter-Strike" casa com "counter strike". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

const INDEX = GAMES.map((g) => ({ name: g.name, key: normalize(g.name) }))

/**
 * Nomes de jogos para o termo, do mais ao menos provável: o nome começa com o
 * termo; alguma palavra do nome começa com ele; o nome só o contém. Dentro de
 * cada grupo, ordem alfabética.
 */
export function suggestGames(query: string, limit = MAX_SUGGESTIONS): string[] {
  const term = normalize(query.slice(0, 40))
  if (term.length < MIN_SUGGEST_LENGTH) return []

  const nameStarts: string[] = []
  const wordStarts: string[] = []
  const contains: string[] = []
  for (const { name, key } of INDEX) {
    if (key.startsWith(term)) nameStarts.push(name)
    else if (key.split(" ").some((word) => word.startsWith(term))) wordStarts.push(name)
    else if (key.includes(term)) contains.push(name)
  }

  const byName = (a: string, b: string) => a.localeCompare(b, "pt-BR")
  return [...nameStarts.sort(byName), ...wordStarts.sort(byName), ...contains.sort(byName)].slice(0, limit)
}
