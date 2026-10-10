import Link from "next/link"
import { SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DELIVERY_FILTER_OPTIONS,
  MAX_SELLER_LEVEL,
  SORT_OPTIONS,
  activeFilterCount,
  type ListingFilters,
} from "@/lib/listing-filters"

const fieldClass =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
const labelClass = "text-xs font-medium text-muted-foreground"

function centsToField(cents: number | null): string {
  if (cents === null) return ""
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",")
}

/**
 * Filtros e ordenação como um formulário GET: sem JavaScript, o resultado vai
 * para a URL (compartilhável, Voltar funciona) e o servidor refaz a consulta.
 * Fica aberto sozinho quando já há filtro ativo.
 */
export function ListingFilterBar({
  basePath,
  query,
  filters,
}: {
  basePath: string
  /** Busca por texto (/busca): preservada ao aplicar os filtros. */
  query?: string
  filters: ListingFilters
}) {
  const active = activeFilterCount(filters)
  const clearHref = query ? `${basePath}?q=${encodeURIComponent(query)}` : basePath
  const hasAnything = active > 0 || filters.sort !== "recentes"

  return (
    <details
      open={hasAnything}
      className="group rounded-xl border border-border bg-card"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="size-4 text-primary" aria-hidden="true" />
        Filtrar e ordenar
        {active > 0 ? (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            {active} {active === 1 ? "filtro" : "filtros"}
          </span>
        ) : null}
      </summary>

      <form
        method="get"
        action={basePath}
        className="grid grid-cols-1 gap-4 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {query ? <input type="hidden" name="q" value={query} /> : null}

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="f-ordem" className={labelClass}>
            Ordenar por
          </label>
          <select id="f-ordem" name="ordem" defaultValue={filters.sort} className={fieldClass}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="f-entrega" className={labelClass}>
            Prazo de entrega
          </label>
          <select id="f-entrega" name="entrega" defaultValue={filters.delivery} className={fieldClass}>
            {DELIVERY_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="f-nivel" className={labelClass}>
            Nível do vendedor
          </label>
          <select id="f-nivel" name="nivel" defaultValue={String(filters.minLevel)} className={fieldClass}>
            <option value="1">Qualquer nível</option>
            {Array.from({ length: MAX_SELLER_LEVEL - 1 }, (_, i) => i + 2).map((level) => (
              <option key={level} value={level}>
                Nível {level} ou mais
              </option>
            ))}
          </select>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-1.5">
          <legend className={labelClass}>Preço (R$)</legend>
          <div className="flex min-w-0 items-center gap-2">
            <Input
              name="min"
              type="text"
              inputMode="decimal"
              maxLength={12}
              placeholder="De"
              aria-label="Preço mínimo em reais"
              defaultValue={centsToField(filters.minPriceCents)}
              className="h-9"
            />
            <span className="text-xs text-muted-foreground" aria-hidden="true">
              até
            </span>
            <Input
              name="max"
              type="text"
              inputMode="decimal"
              maxLength={12}
              placeholder="Até"
              aria-label="Preço máximo em reais"
              defaultValue={centsToField(filters.maxPriceCents)}
              className="h-9"
            />
          </div>
        </fieldset>

        <label className="relative flex min-h-9 cursor-pointer items-center gap-2 text-sm sm:col-span-2 lg:col-span-4 lg:col-start-1">
          <input
            type="checkbox"
            name="avaliados"
            value="1"
            defaultChecked={filters.onlyReviewed}
            className="size-4 shrink-0 accent-primary"
          />
          Só anúncios com avaliações
        </label>

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
          <Button type="submit" className="h-9 px-5">
            Aplicar
          </Button>
          {hasAnything ? (
            <Link
              href={clearHref}
              className="rounded-md px-1 py-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Limpar filtros
            </Link>
          ) : null}
        </div>
      </form>
    </details>
  )
}
