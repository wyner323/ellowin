/**
 * Extrato mensal de vendas e taxas: matemática pura (meses, preenchimento dos meses sem venda, totais). O mês é o de
 * Brasília, no formato "AAAA-MM", e uma venda conta no mês em que foi CONCLUÍDA (quando o valor foi liberado ao vendedor).
 */

export type StatementMonth = {
  /** "2026-10" */
  month: string
  sales: number
  grossCents: number
  feeCents: number
  netCents: number
}

const TZ = "America/Sao_Paulo"

/** O mês corrente em Brasília, "AAAA-MM". */
export function currentMonth(now: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}`
}

/** Os `count` meses terminando em `endMonth`, do mais recente para o mais antigo. */
export function monthKeys(endMonth: string, count: number): string[] {
  const [year, month] = endMonth.split("-").map(Number)
  const keys: string[] = []
  for (let i = 0; i < count; i++) {
    const index = year * 12 + (month - 1) - i
    keys.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`)
  }
  return keys
}

/** Garante uma linha para cada mês da janela (os sem venda ficam zerados) e ignora linhas fora dela. */
export function fillMonths(rows: StatementMonth[], keys: string[]): StatementMonth[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]))
  return keys.map((month) => byMonth.get(month) ?? { month, sales: 0, grossCents: 0, feeCents: 0, netCents: 0 })
}

export function totals(rows: StatementMonth[]): Omit<StatementMonth, "month"> {
  return rows.reduce(
    (sum, r) => ({
      sales: sum.sales + r.sales,
      grossCents: sum.grossCents + r.grossCents,
      feeCents: sum.feeCents + r.feeCents,
      netCents: sum.netCents + r.netCents,
    }),
    { sales: 0, grossCents: 0, feeCents: 0, netCents: 0 },
  )
}

/** "outubro de 2026" para um "2026-10". */
export function monthName(month: string): string {
  const [year, m] = month.split("-").map(Number)
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
}

/** Taxa efetiva (taxa ÷ valor bruto) em %, ou nulo sem venda. */
export function effectiveFeePercent(grossCents: number, feeCents: number): number | null {
  return grossCents > 0 ? (feeCents / grossCents) * 100 : null
}
