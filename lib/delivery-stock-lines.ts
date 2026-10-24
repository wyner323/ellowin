/**
 * Regras puras do estoque de entrega automática: o que o vendedor cola na caixa de texto (um item por linha), os
 * limites e a máscara que o painel mostra no lugar do conteúdo. Sem banco, para a tela e os testes.
 */

/** Categorias em que a entrega automática faz sentido: um código ou login por venda. */
export const AUTO_DELIVERY_CATEGORIES = ["gift-cards", "contas"] as const

export function allowsAutoDelivery(categorySlug: string) {
  return (AUTO_DELIVERY_CATEGORIES as readonly string[]).includes(categorySlug)
}

export const MAX_STOCK_BATCH = 500
export const MIN_STOCK_ITEM_LENGTH = 4
export const MAX_STOCK_ITEM_LENGTH = 500
/** Itens disponíveis ao mesmo tempo, por item do anúncio. */
export const MAX_STOCK_AVAILABLE = 10_000

/** Mesmo marcador de lib/secret-box.ts: texto digitado com esse início seria lido como cifra. */
const ENCRYPTED_PREFIX = "enc:v1:"

export type ParsedStock = {
  items: string[]
  /** itens repetidos dentro do próprio envio (descartados) */
  duplicates: number
  /** problemas com número da linha, para o vendedor corrigir (quando há erro nada é gravado) */
  errors: string[]
}

export function parseStockLines(text: string): ParsedStock {
  const items: string[] = []
  const seen = new Set<string>()
  const errors: string[] = []
  let duplicates = 0

  const lines = text.split(/\r\n|\r|\n/)
  for (let i = 0; i < lines.length; i++) {
    const value = lines[i].trim()
    if (value === "") continue
    const line = i + 1

    if (value.length < MIN_STOCK_ITEM_LENGTH) {
      errors.push(`Linha ${line}: o item precisa ter ao menos ${MIN_STOCK_ITEM_LENGTH} caracteres.`)
      continue
    }
    if (value.length > MAX_STOCK_ITEM_LENGTH) {
      errors.push(`Linha ${line}: o item pode ter até ${MAX_STOCK_ITEM_LENGTH} caracteres.`)
      continue
    }
    if (value.startsWith(ENCRYPTED_PREFIX)) {
      errors.push(`Linha ${line}: o item não pode começar com ${ENCRYPTED_PREFIX}.`)
      continue
    }
    if (seen.has(value)) {
      duplicates++
      continue
    }
    seen.add(value)
    items.push(value)
  }

  if (items.length > MAX_STOCK_BATCH) {
    errors.push(`Envie até ${MAX_STOCK_BATCH} itens por vez (você enviou ${items.length}).`)
  }
  return { items, duplicates, errors }
}

/**
 * O que o painel mostra de um item ainda não vendido: as 2 primeiras e as 2 últimas letras de um item longo, ou só
 * pontos para um curto. O vendedor reconhece a linha sem que o conteúdo apareça de novo na tela.
 */
export function maskStockItem(value: string) {
  if (value.length < 10) return "••••••"
  return `${value.slice(0, 2)}••••${value.slice(-2)}`
}
