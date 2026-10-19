/**
 * Contas puras das métricas do painel do vendedor (sem banco e sem React), usadas tanto no servidor quanto nos
 * gráficos do navegador. Dinheiro é sempre em centavos inteiros.
 */

export const ANALYTICS_PERIODS = [7, 30, 90] as const
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number]
export const DEFAULT_PERIOD: AnalyticsPeriod = 30

/** `?periodo=` da URL: só 7, 30 ou 90; qualquer outra coisa vira o padrão (nunca vira consulta). */
export function parsePeriod(raw: string | string[] | undefined): AnalyticsPeriod {
  const value = Number(Array.isArray(raw) ? raw[0] : raw)
  return (ANALYTICS_PERIODS as readonly number[]).includes(value) ? (value as AnalyticsPeriod) : DEFAULT_PERIOD
}

/** Divisão que devolve nulo em vez de NaN/Infinity quando o denominador é zero. */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

/** Variação percentual de `current` sobre `previous`; nulo quando não há base de comparação (anterior = 0). */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export type Delta = {
  /** current - previous, na unidade do número (centavos, pedidos...) */
  diff: number
  /** % sobre o período anterior; nulo se o anterior foi zero */
  pct: number | null
  direction: "up" | "down" | "flat"
}

export function delta(current: number, previous: number): Delta {
  const diff = current - previous
  return { diff, pct: pctChange(current, previous), direction: diff > 0 ? "up" : diff < 0 ? "down" : "flat" }
}

/** "12,3%" / "+8%" para exibir; vírgula decimal, sem casas quando é inteiro. */
export function formatPercent(value: number | null, opts: { sign?: boolean; digits?: number } = {}): string {
  if (value === null || !Number.isFinite(value)) return "—"
  const digits = opts.digits ?? (Math.abs(value) >= 10 ? 0 : 1)
  const text = Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: digits })
  const sign = value < 0 ? "−" : opts.sign && value > 0 ? "+" : ""
  return `${sign}${text}%`
}

/** Números grandes no eixo: 0, 500, 1 mil, 1,5 mil, 2 mi. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? "−" : ""
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
  return `${sign}${Math.round(abs).toLocaleString("pt-BR")}`
}

/** Teto "redondo" para o eixo Y (1, 2, 2,5, 5 × 10^n) e quatro divisões de grade. */
export function niceScale(max: number, ticks = 4): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] }
  const rough = max / ticks
  const pow = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow
  const top = Math.ceil(max / step) * step
  const list: number[] = []
  for (let v = 0; v <= top + step / 1000; v += step) list.push(Math.round(v * 1e6) / 1e6)
  return { top, ticks: list }
}

/** Agrupa a cauda num "Outros": mantém os `keep` maiores (por `value`) e soma o resto. */
export function topWithOthers<T extends { label: string; value: number }>(rows: T[], keep: number, othersLabel = "Outros"): { label: string; value: number }[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  const head = sorted.slice(0, keep).map((r) => ({ label: r.label, value: r.value }))
  const tail = sorted.slice(keep)
  const rest = tail.reduce((sum, r) => sum + r.value, 0)
  return rest > 0 ? [...head, { label: othersLabel, value: rest }] : head
}

/** Soma móvel: suaviza a curva diária sem inventar pontos (janela menor no começo). */
export function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const from = Math.max(0, i - window + 1)
    const slice = values.slice(from, i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

export type GoalStatus = "alcancada" | "no_ritmo" | "abaixo" | "inicio"

export type GoalProgress = {
  percent: number
  projectedCents: number
  remainingCents: number
  daysLeft: number
  /** quanto falta vender por dia, nos dias que restam (o dia de hoje já conta como decorrido) */
  neededPerDayCents: number | null
  status: GoalStatus
}

/**
 * Andamento da meta do mês. `dayOfMonth` é o dia de hoje (1–31) no calendário de Brasília e `daysInMonth` o total de
 * dias do mês. A projeção assume o ritmo médio do mês até hoje; nos 2 primeiros dias é cedo demais para opinar ("inicio").
 */
export function goalProgress(opts: { revenueCents: number; goalCents: number; dayOfMonth: number; daysInMonth: number }): GoalProgress {
  const { revenueCents, goalCents, daysInMonth } = opts
  const dayOfMonth = Math.min(Math.max(1, opts.dayOfMonth), daysInMonth)
  const projectedCents = Math.round((revenueCents / dayOfMonth) * daysInMonth)
  const remainingCents = Math.max(0, goalCents - revenueCents)
  const daysLeft = daysInMonth - dayOfMonth
  const status: GoalStatus =
    revenueCents >= goalCents ? "alcancada" : dayOfMonth < 3 ? "inicio" : projectedCents >= goalCents ? "no_ritmo" : "abaixo"
  return {
    percent: goalCents > 0 ? (revenueCents / goalCents) * 100 : 0,
    projectedCents,
    remainingCents,
    daysLeft,
    neededPerDayCents: remainingCents > 0 && daysLeft > 0 ? Math.ceil(remainingCents / daysLeft) : null,
    status,
  }
}

/** Menor número de anúncios parecidos (de outros vendedores) para a comparação de preço valer a pena mostrar. */
export const MIN_PRICE_PEERS = 3

export type PriceVsMarket = { pct: number; verdict: "abaixo" | "na_media" | "acima" }

/**
 * Preço do anúncio contra a mediana de anúncios parecidos (mesmo jogo e categoria, outros vendedores, à venda).
 * Nulo quando há poucos concorrentes (uma mediana de 1 ou 2 anúncios revelaria o preço de alguém).
 * Até 5% de diferença conta como "na média".
 */
export function priceVsMarket(ownCents: number | null, medianCents: number | null, peers: number): PriceVsMarket | null {
  if (ownCents === null || medianCents === null || peers < MIN_PRICE_PEERS || medianCents <= 0) return null
  const pct = ((ownCents - medianCents) / medianCents) * 100
  return { pct, verdict: pct < -5 ? "abaixo" : pct > 5 ? "acima" : "na_media" }
}
