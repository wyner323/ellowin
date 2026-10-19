import { areaPath, linePath, scaleY, type Point } from "@/lib/chart-geometry"

/**
 * Miniatura da tendência dentro de um indicador: só a forma da curva (sem eixos). Decorativa: o número e a variação
 * já dizem o que importa em texto, então fica escondida de leitores de tela.
 */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const w = 168
  const h = 28
  if (values.length < 2 || values.every((v) => v === 0)) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true" focusable="false">
        <line x1="0" y1={h - 2} x2={w} y2={h - 2} stroke="var(--border)" strokeWidth="1" />
      </svg>
    )
  }
  const max = Math.max(...values)
  const pts: Point[] = values.map((v, i) => ({ x: 2 + (i * (w - 4)) / (values.length - 1), y: scaleY(v, max, 4, h - 3) }))
  const last = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true" focusable="false">
      <path d={areaPath(pts, h - 2)} fill="var(--color-chart-1)" fillOpacity="0.1" />
      <path d={linePath(pts)} fill="none" stroke="var(--color-chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r="3.5" fill="var(--color-chart-1)" stroke="var(--card)" strokeWidth="2" />
    </svg>
  )
}
