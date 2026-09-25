import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

function href(basePath: string, params: Record<string, string | undefined>, page: number) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  if (page > 1) search.set("pagina", String(page))
  const qs = search.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/**
 * Paginação por links (?pagina=N), renderizada no servidor — sem estado no
 * cliente, então o botão Voltar e links compartilhados funcionam. `params`
 * carrega os outros filtros da tela (status, busca) para não se perderem ao
 * mudar de página. Não renderiza nada quando cabe em uma página só.
 */
export function Pagination({
  page,
  pages,
  total,
  basePath,
  params = {},
  className,
}: {
  page: number
  pages: number
  total: number
  basePath: string
  params?: Record<string, string | undefined>
  className?: string
}) {
  if (pages <= 1) return null

  const linkClass =
    "inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-3 text-sm transition-colors hover:border-primary/50"
  const disabledClass =
    "inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground/60"

  return (
    <nav
      aria-label="Paginação"
      className={cn("flex flex-wrap items-center justify-between gap-3", className)}
    >
      {page > 1 ? (
        <Link href={href(basePath, params, page - 1)} className={linkClass} rel="prev">
          <ChevronLeft className="size-4" aria-hidden="true" />
          Anterior
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          <ChevronLeft className="size-4" aria-hidden="true" />
          Anterior
        </span>
      )}

      <span className="text-xs text-muted-foreground">
        Página {page} de {pages} · {total} {total === 1 ? "item" : "itens"}
      </span>

      {page < pages ? (
        <Link href={href(basePath, params, page + 1)} className={linkClass} rel="next">
          Próxima
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          Próxima
          <ChevronRight className="size-4" aria-hidden="true" />
        </span>
      )}
    </nav>
  )
}
