import { MAX_PRICE_CENTS, MAX_STOCK, MIN_PRICE_CENTS } from "@/lib/listing-checks"
import { parseToCents } from "@/lib/money"

/**
 * Matemática pura da edição de preço e estoque em lote: ajuste por porcentagem, texto de preço como o formulário usa,
 * e a lista mínima de mudanças (só o que o vendedor realmente alterou). Sem banco: a tela e os testes usam o mesmo código.
 */

export const MAX_BULK_CHANGES = 100
/** Faixa aceita no ajuste por porcentagem (−90% a +1000%): evita zerar ou explodir o preço por um dedo escorregando. */
export const MIN_PERCENT = -90
export const MAX_PERCENT = 1000

/** "10", "-5,5" ou "+12.5" → número; nulo se não for um número dentro da faixa. */
export function parsePercent(text: string): number | null {
  const normalized = text.trim().replace(",", ".")
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) && value >= MIN_PERCENT && value <= MAX_PERCENT ? value : null
}

/** Novo preço (em centavos inteiros) depois de somar `percent` %, arredondado ao centavo e preso entre o mínimo e o teto. */
export function applyPercent(priceCents: number, percent: number): number {
  const next = Math.round(priceCents * (1 + percent / 100))
  return Math.min(MAX_PRICE_CENTS, Math.max(MIN_PRICE_CENTS, next))
}

export type BulkRow = { variantId: number; priceCents: number; stock: number }
export type BulkEdit = { price: string; stock: string }
export type BulkChange = { variantId: number; price?: string; stock?: string }

/**
 * Das linhas originais e do que está nos campos, só as mudanças reais. Preço ou estoque iguais ao original (mesmo
 * escritos de outro jeito, como "49.9") não viram mudança.
 */
export function diffChanges(rows: BulkRow[], edits: Record<number, BulkEdit | undefined>): BulkChange[] {
  const changes: BulkChange[] = []
  for (const row of rows) {
    const edit = edits[row.variantId]
    if (!edit) continue
    const change: BulkChange = { variantId: row.variantId }
    const cents = parseToCents(edit.price)
    if (cents !== null && cents !== row.priceCents) change.price = edit.price
    const stock = Number.parseInt(edit.stock, 10)
    if (Number.isFinite(stock) && String(stock) === edit.stock.trim() && stock !== row.stock) change.stock = edit.stock
    if (change.price !== undefined || change.stock !== undefined) changes.push(change)
  }
  return changes
}

/** Valida o texto de preço e estoque de UMA mudança; devolve os números ou a mensagem para o vendedor. */
export function parseChange(change: BulkChange): { priceCents?: number; stock?: number; error?: string } {
  const out: { priceCents?: number; stock?: number; error?: string } = {}
  if (change.price !== undefined) {
    const cents = parseToCents(change.price)
    if (cents === null || cents < MIN_PRICE_CENTS) return { error: "O preço mínimo é R$ 1,00." }
    if (cents > MAX_PRICE_CENTS) return { error: "O preço máximo é R$ 100.000,00." }
    out.priceCents = cents
  }
  if (change.stock !== undefined) {
    const text = change.stock.trim()
    const stock = Number.parseInt(text, 10)
    if (!/^\d+$/.test(text) || !Number.isFinite(stock) || stock < 0 || stock > MAX_STOCK) return { error: `O estoque deve ser de 0 a ${MAX_STOCK.toLocaleString("pt-BR")}.` }
    out.stock = stock
  }
  if (out.priceCents === undefined && out.stock === undefined) return { error: "Nada para alterar." }
  return out
}
