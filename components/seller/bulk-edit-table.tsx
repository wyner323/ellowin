"use client"

import { useId, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { bulkUpdateVariants } from "@/app/actions/products-bulk"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { applyPercent, diffChanges, parsePercent, type BulkEdit } from "@/lib/bulk-edit"
import { centsToInput, formatCents, parseToCents } from "@/lib/money"
import { cn } from "@/lib/utils"

export type BulkTableRow = {
  variantId: number
  productId: number
  productTitle: string
  productStatus: string
  deliveryType: string
  label: string
  priceCents: number
  stock: number
}

/**
 * Tabela de trabalho: preço e estoque de vários itens de uma vez. A barra de cima aplica uma porcentagem ao preço ou
 * define o estoque dos itens marcados (só preenche os campos: nada vai ao servidor até "Salvar"). Salvar manda só o que
 * mudou, e o servidor valida tudo de novo. Estoque de entrega automática é o número de itens cadastrados: fica travado.
 */
export function BulkEditTable({ rows }: { rows: BulkTableRow[] }) {
  const id = useId()
  const router = useRouter()
  const initial = useMemo<Record<number, BulkEdit>>(
    () => Object.fromEntries(rows.map((r) => [r.variantId, { price: centsToInput(r.priceCents), stock: String(r.stock) }])),
    [rows],
  )
  const [edits, setEdits] = useState<Record<number, BulkEdit>>(initial)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [percent, setPercent] = useState("")
  const [stockAll, setStockAll] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const changes = diffChanges(rows, edits)
  const changed = new Set(changes.map((c) => c.variantId))
  const percentValue = parsePercent(percent)
  const allSelected = rows.length > 0 && selected.size === rows.length

  function patch(variantId: number, next: Partial<BulkEdit>) {
    setEdits((current) => ({ ...current, [variantId]: { ...current[variantId], ...next } }))
  }

  function toggle(variantId: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(variantId)) next.delete(variantId)
      else next.add(variantId)
      return next
    })
  }

  function applyPercentToSelected() {
    if (percentValue === null) return
    setEdits((current) => {
      const next = { ...current }
      for (const row of rows) {
        if (!selected.has(row.variantId)) continue
        const cents = parseToCents(next[row.variantId].price) ?? row.priceCents
        next[row.variantId] = { ...next[row.variantId], price: centsToInput(applyPercent(cents, percentValue)) }
      }
      return next
    })
  }

  function applyStockToSelected() {
    const text = stockAll.trim()
    if (!/^\d+$/.test(text)) return
    setEdits((current) => {
      const next = { ...current }
      for (const row of rows) {
        if (!selected.has(row.variantId) || row.deliveryType === "automatica") continue
        next[row.variantId] = { ...next[row.variantId], stock: text }
      }
      return next
    })
  }

  function save() {
    setError(null)
    start(async () => {
      const result = await bulkUpdateVariants(changes)
      if (result.ok) {
        toast.success(result.message ?? "Alterações salvas.")
        setSelected(new Set())
        router.refresh()
      } else {
        setError(result.error ?? "Não foi possível salvar as alterações.")
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Marque os itens e aplique um ajuste, ou edite direto nos campos. Nada é salvo até você clicar em &quot;Salvar alterações&quot;.
        </p>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-pct`} className="text-xs font-medium text-muted-foreground">
              Ajustar o preço dos marcados (%)
            </label>
            <div className="flex gap-2">
              <Input
                id={`${id}-pct`}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                inputMode="decimal"
                placeholder="-10 ou 15"
                className="h-9 w-28"
                aria-invalid={percent.trim() !== "" && percentValue === null ? true : undefined}
              />
              <Button type="button" variant="outline" size="sm" className="h-9" disabled={pending || selected.size === 0 || percentValue === null} onClick={applyPercentToSelected}>
                Aplicar
              </Button>
            </div>
            {percent.trim() !== "" && percentValue === null ? <span className="text-xs text-destructive">Use um número de -90 a 1000.</span> : null}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-est`} className="text-xs font-medium text-muted-foreground">
              Definir o estoque dos marcados
            </label>
            <div className="flex gap-2">
              <Input id={`${id}-est`} value={stockAll} onChange={(e) => setStockAll(e.target.value)} inputMode="numeric" placeholder="0" className="h-9 w-24" />
              <Button type="button" variant="outline" size="sm" className="h-9" disabled={pending || selected.size === 0 || !/^\d+$/.test(stockAll.trim())} onClick={applyStockToSelected}>
                Aplicar
              </Button>
            </div>
          </div>
          <span className="pb-2 text-xs text-muted-foreground tabular-nums">
            {selected.size} {selected.size === 1 ? "marcado" : "marcados"}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Preço e estoque dos itens dos seus anúncios</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-primary)]"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.variantId)))}
                  aria-label="Marcar todos os itens desta página"
                />
              </th>
              <th scope="col" className="px-3 py-2 font-medium">Anúncio e item</th>
              <th scope="col" className="w-36 px-3 py-2 font-medium">Preço (R$)</th>
              <th scope="col" className="w-28 px-3 py-2 font-medium">Estoque</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const edit = edits[row.variantId] ?? initial[row.variantId]
              const automatic = row.deliveryType === "automatica"
              const isChanged = changed.has(row.variantId)
              return (
                <tr key={row.variantId} className={cn("border-b border-border last:border-0", isChanged && "bg-primary/5")}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-primary)]"
                      checked={selected.has(row.variantId)}
                      onChange={() => toggle(row.variantId)}
                      aria-label={`Marcar ${row.label} de ${row.productTitle}`}
                    />
                  </td>
                  <td className="min-w-0 px-3 py-2">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{row.label}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.productTitle}
                        {row.productStatus !== "ativo" ? " · fora da vitrine" : ""}
                      </span>
                      {isChanged ? <span className="text-xs text-primary">alterado (era {formatCents(row.priceCents)} · estoque {row.stock})</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={edit.price}
                      onChange={(e) => patch(row.variantId, { price: e.target.value })}
                      inputMode="decimal"
                      className="h-8 w-28"
                      aria-label={`Preço de ${row.label}`}
                      disabled={pending}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {automatic ? (
                      <span className="text-xs text-muted-foreground" title="Na entrega automática o estoque é o número de itens cadastrados">
                        {row.stock} (itens)
                      </span>
                    ) : (
                      <Input
                        value={edit.stock}
                        onChange={(e) => patch(row.variantId, { stock: e.target.value })}
                        inputMode="numeric"
                        className="h-8 w-20"
                        aria-label={`Estoque de ${row.label}`}
                        disabled={pending}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur">
        <Button onClick={save} disabled={pending || changes.length === 0}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
          Salvar alterações
        </Button>
        <span className="text-sm text-muted-foreground" role="status">
          {changes.length === 0 ? "Nenhuma alteração ainda." : `${changes.length} ${changes.length === 1 ? "item alterado" : "itens alterados"} nesta página, ainda não salvos.`}
        </span>
        {changes.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setEdits(initial)}>
            Desfazer tudo
          </Button>
        ) : null}
        {error ? (
          <p role="alert" className="w-full text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
