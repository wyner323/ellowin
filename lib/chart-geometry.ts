/**
 * Geometria dos gráficos SVG do painel (pura, sem React): escalas, caminhos e rótulos do eixo X.
 * Os gráficos são desenhados à mão em SVG (e não por uma biblioteca) para renderizarem no servidor, pesarem pouco e
 * poderem ser conferidos em teste.
 */

export type Point = { x: number; y: number }

/** Mapeia `value` de [0, max] para [bottom, top] (y cresce para baixo no SVG). */
export function scaleY(value: number, max: number, top: number, bottom: number): number {
  if (!(max > 0)) return bottom
  return bottom - (Math.max(0, value) / max) * (bottom - top)
}

/** Centro da faixa de cada ponto (as barras ocupam a faixa inteira; a linha passa pelo centro). */
export function bandCenter(index: number, count: number, left: number, right: number): number {
  const band = (right - left) / Math.max(1, count)
  return left + band * (index + 0.5)
}

export function linePath(points: Point[]): string {
  if (points.length === 0) return ""
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`).join(" ")
}

/** Área sob a linha, fechada na linha de base. */
export function areaPath(points: Point[], baseline: number): string {
  if (points.length === 0) return ""
  const first = points[0]
  const last = points[points.length - 1]
  return `${linePath(points)} L${round(last.x)} ${round(baseline)} L${round(first.x)} ${round(baseline)} Z`
}

/** Índices dos rótulos do eixo X: sempre o primeiro e o último, com os demais bem espaçados. */
export function xTickIndexes(count: number, maxLabels: number): number[] {
  if (count <= 0) return []
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i)
  const out = new Set<number>([0, count - 1])
  const slots = Math.max(2, maxLabels)
  for (let i = 1; i < slots - 1; i++) out.add(Math.round((i * (count - 1)) / (slots - 1)))
  return [...out].sort((a, b) => a - b)
}

/** Ponto mais próximo de um X do ponteiro (para o cursor de leitura). */
export function nearestIndex(pointerX: number, count: number, left: number, right: number): number {
  if (count <= 1) return 0
  const band = (right - left) / count
  return Math.min(count - 1, Math.max(0, Math.floor((pointerX - left) / band)))
}

/** "2026-10-19" → "19/10" (sem passar por Date: evita o dia errado por fuso). */
export function shortDate(day: string): string {
  const [, m, d] = day.split("-")
  return `${d}/${m}`
}

/** "2026-10-19" → "19 de out." para tooltips. */
export function longDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" })
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
