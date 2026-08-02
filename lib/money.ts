/**
 * Dinheiro no Ellowin é sempre um inteiro em centavos.
 *
 * Guardar reais como float causa erros de arredondamento que, somados ao longo
 * de milhares de transações, quebram o fechamento da carteira. Toda conversão
 * para exibição acontece na borda (componentes), nunca no cálculo.
 */

/** Taxa da plataforma em basis points: 800 = 8%. */
export const PLATFORM_FEE_BPS = 800

/** Dias após a entrega em que o valor é liberado automaticamente ao vendedor. */
export const AUTO_RELEASE_DAYS = 7

export function formatCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

/** Converte "1.234,56", "1234.56" ou "1234" para centavos. */
export function parseToCents(input: string): number | null {
  const raw = input.trim()
  if (!raw) return null

  // Remove separador de milhar e normaliza a vírgula decimal do padrão pt-BR.
  const normalized = raw
    .replace(/[^\d.,-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")

  const value = Number(normalized)
  if (!Number.isFinite(value) || value < 0) return null

  return Math.round(value * 100)
}

/** Taxa cobrada do vendedor sobre o valor do pedido. */
export function feeForCents(amountCents: number) {
  return Math.round((amountCents * PLATFORM_FEE_BPS) / 10_000)
}

/** Divide o valor do pedido entre taxa da plataforma e líquido do vendedor. */
export function splitOrderAmount(amountCents: number) {
  const feeCents = feeForCents(amountCents)
  return { amountCents, feeCents, sellerNetCents: amountCents - feeCents }
}

export function formatRating(sum: number, count: number) {
  if (count === 0) return null
  return Math.round((sum / count) * 10) / 10
}
