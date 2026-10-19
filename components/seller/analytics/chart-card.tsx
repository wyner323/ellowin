"use client"

import { useState, type ReactNode } from "react"
import { BarChart3, Table2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type ChartTable = { columns: string[]; rows: string[][] }

/**
 * Cartão de um gráfico: título, legenda de uma linha e a alternância "Ver tabela / Ver gráfico". Todo gráfico do painel
 * tem o mesmo dado em tabela, para quem não enxerga cores, usa leitor de tela ou quer copiar os números.
 */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  className,
}: {
  title: string
  subtitle?: string
  /** chaves de leitura (ex.: linha roxa = este período) */
  legend?: ReactNode
  table?: ChartTable
  children: ReactNode
  className?: string
}) {
  const [asTable, setAsTable] = useState(false)

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <CardTitle className="text-base">{title}</CardTitle>
            {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
          </div>
          {table ? (
            <Button type="button" size="xs" variant="outline" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
              {asTable ? <BarChart3 className="size-3.5" aria-hidden="true" /> : <Table2 className="size-3.5" aria-hidden="true" />}
              {asTable ? "Ver gráfico" : "Ver tabela"}
            </Button>
          ) : null}
        </div>
        {legend && !asTable ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs">{legend}</div> : null}
      </CardHeader>
      <CardContent>
        {asTable && table ? (
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="sticky top-0 bg-muted text-muted-foreground">
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-1.5">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

/** Chave da legenda: traço curto na cor da série + nome (o texto usa a cor de texto, nunca a da série). */
export function LegendKey({ color, label }: { color: "primary" | "muted"; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span
        className={color === "primary" ? "h-0.5 w-4 rounded bg-[var(--color-chart-1)]" : "h-0.5 w-4 rounded bg-muted-foreground/60"}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}
