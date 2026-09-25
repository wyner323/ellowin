/** Itens por página nas listas (pedidos, anúncios, extrato, disputas encerradas). */
export const PAGE_SIZE = 20

/** Lê `?pagina=` de um searchParams: só inteiro >= 1, qualquer outra coisa vira a página 1. */
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !/^\d{1,6}$/.test(value)) return 1
  const n = Number(value)
  return n >= 1 ? n : 1
}

export function totalPages(total: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

/**
 * Resolve a página pedida contra o total real: uma página além do fim (lista
 * encolheu, ou ?pagina=999 digitado à mão) cai na última em vez de mostrar vazio.
 */
export function resolvePage(requested: number, total: number, pageSize = PAGE_SIZE) {
  const pages = totalPages(total, pageSize)
  const page = Math.min(Math.max(1, requested), pages)
  return { page, pages, offset: (page - 1) * pageSize, limit: pageSize }
}

/** Escapa `%`, `_` e `\` para uso literal dentro de um ILIKE. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
