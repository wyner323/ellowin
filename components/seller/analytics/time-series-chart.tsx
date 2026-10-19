"use client"

import { useEffect, useId, useRef, useState } from "react"
import { formatCompact, niceScale } from "@/lib/analytics-math"
import { areaPath, bandCenter, linePath, longDate, nearestIndex, scaleY, shortDate, xTickIndexes, type Point } from "@/lib/chart-geometry"
import { formatValue, type ValueKind } from "@/components/seller/analytics/format"

export type SeriesPoint = { day: string; value: number; previous?: number | null; previousDay?: string }

const MARGIN = { top: 14, right: 12, bottom: 24 }

/**
 * Gráfico de uma série ao longo dos dias, em SVG: área + linha de 2px (ou colunas de até 24px), grade de fio fino,
 * eixo Y com números redondos, rótulos de data espaçados, cursor de leitura que acompanha o ponteiro (e as setas do
 * teclado) e, opcionalmente, o mesmo período anterior como linha cinza para comparar. O mesmo dado também existe
 * como tabela (o cartão que envolve este gráfico oferece "Ver tabela").
 */
export function TimeSeriesChart({
  points,
  kind,
  label,
  mode = "area",
  previousLabel = "Período anterior",
  summary,
}: {
  points: SeriesPoint[]
  kind: ValueKind
  label: string
  mode?: "area" | "bars"
  previousLabel?: string
  /** frase de leitor de tela (ex.: "Receita por dia, total R$ 1.500,00") */
  summary: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)
  const titleId = useId()

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const height = width < 460 ? 200 : 244
  const hasPrevious = mode === "area" && points.some((p) => p.previous !== null && p.previous !== undefined)
  const dataMax = Math.max(0, ...points.map((p) => p.value), ...(hasPrevious ? points.map((p) => p.previous ?? 0) : []))
  const { top: yMax, ticks } = niceScale(dataMax)
  const toAxis = (v: number) => formatCompact(kind === "money" ? v / 100 : v)
  const left = Math.max(34, 12 + Math.max(...ticks.map((t) => toAxis(t).length)) * 6.2)
  const right = width - MARGIN.right
  const bottom = height - MARGIN.bottom
  const top = MARGIN.top

  const pts: Point[] = points.map((p, i) => ({ x: bandCenter(i, points.length, left, right), y: scaleY(p.value, yMax, top, bottom) }))
  const prevPts: Point[] = hasPrevious
    ? points.map((p, i) => ({ x: bandCenter(i, points.length, left, right), y: scaleY(p.previous ?? 0, yMax, top, bottom) }))
    : []
  const band = (right - left) / Math.max(1, points.length)
  const barWidth = Math.min(24, Math.max(2, band * 0.7))
  const labelIdx = xTickIndexes(points.length, width < 460 ? 4 : 6)
  const last = pts[pts.length - 1]
  const activePoint = active !== null ? points[active] : null

  function onPointer(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    setActive(nearestIndex(event.clientX - rect.left, points.length, left, right))
  }

  function onKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (points.length === 0) return
    const current = active ?? points.length - 1
    const next =
      event.key === "ArrowLeft"
        ? Math.max(0, current - 1)
        : event.key === "ArrowRight"
          ? Math.min(points.length - 1, current + 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? points.length - 1
              : null
    if (next === null) return
    event.preventDefault()
    setActive(next)
  }

  const tipLeft = activePoint ? Math.min(Math.max(pts[active!].x, 96), width - 96) : 0

  return (
    <div
      ref={wrapRef}
      className="relative w-full select-none"
      tabIndex={0}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
      role="group"
      aria-label={`${summary}. Use as setas do teclado para ler dia a dia, ou veja a tabela.`}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
        onPointerMove={onPointer}
        onPointerLeave={() => setActive(null)}
        className="block touch-pan-y"
      >
        <title id={titleId}>{summary}</title>

        {ticks.map((t) => {
          const y = scaleY(t, yMax, top, bottom)
          return (
            <g key={t}>
              <line x1={left} x2={right} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={left - 6} y={y + 3.5} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
                {toAxis(t)}
              </text>
            </g>
          )
        })}

        {labelIdx.map((i) => (
          <text
            key={i}
            x={pts[i].x}
            y={height - 6}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            fontSize="11"
            fill="var(--muted-foreground)"
          >
            {shortDate(points[i].day)}
          </text>
        ))}

        {mode === "bars" ? (
          points.map((p, i) => {
            if (p.value <= 0) return null
            const h = Math.max(2, bottom - pts[i].y)
            const r = Math.min(4, barWidth / 2, h)
            const x = pts[i].x - barWidth / 2
            const y = bottom - h
            return (
              <path
                key={p.day}
                d={`M${x} ${bottom} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + barWidth - r} Q${x + barWidth} ${y} ${x + barWidth} ${y + r} V${bottom} Z`}
                fill="var(--color-chart-1)"
                fillOpacity={active === null || active === i ? 1 : 0.55}
              />
            )
          })
        ) : (
          <>
            {hasPrevious ? (
              <path d={linePath(prevPts)} fill="none" stroke="var(--muted-foreground)" strokeOpacity="0.55" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ) : null}
            <path d={areaPath(pts, bottom)} fill="var(--color-chart-1)" fillOpacity="0.1" />
            <path d={linePath(pts)} fill="none" stroke="var(--color-chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}

        {mode === "area" && last ? (
          <>
            <circle cx={last.x} cy={last.y} r="4.5" fill="var(--color-chart-1)" stroke="var(--card)" strokeWidth="2" />
            {active === null ? (
              <text x={last.x} y={Math.max(top + 8, last.y - 10)} textAnchor="end" fontSize="12" fontWeight="600" fill="var(--foreground)">
                {formatValue(points[points.length - 1].value, kind)}
              </text>
            ) : null}
          </>
        ) : null}

        {activePoint && mode === "area" ? (
          <>
            <line x1={pts[active!].x} x2={pts[active!].x} y1={top} y2={bottom} stroke="var(--muted-foreground)" strokeOpacity="0.5" strokeWidth="1" />
            <circle cx={pts[active!].x} cy={pts[active!].y} r="4.5" fill="var(--color-chart-1)" stroke="var(--card)" strokeWidth="2" />
          </>
        ) : null}
      </svg>

      {activePoint ? (
        <div
          className="pointer-events-none absolute top-1 z-10 w-44 -translate-x-1/2 rounded-lg bg-popover p-2.5 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10"
          style={{ left: tipLeft }}
          role="status"
        >
          <div className="text-muted-foreground">{longDate(activePoint.day)}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-0.5 w-3 shrink-0 rounded bg-[var(--color-chart-1)]" aria-hidden="true" />
            <strong className="font-display text-sm tabular-nums">{formatValue(activePoint.value, kind)}</strong>
            <span className="truncate text-muted-foreground">{label}</span>
          </div>
          {hasPrevious && activePoint.previous !== null && activePoint.previous !== undefined ? (
            <div className="mt-1 flex items-center gap-2 text-muted-foreground">
              <span className="h-0.5 w-3 shrink-0 rounded bg-muted-foreground/60" aria-hidden="true" />
              <span className="tabular-nums">{formatValue(activePoint.previous, kind)}</span>
              <span className="truncate">
                {previousLabel}
                {activePoint.previousDay ? ` (${shortDate(activePoint.previousDay)})` : ""}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
