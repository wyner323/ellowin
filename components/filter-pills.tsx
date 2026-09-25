import Link from "next/link"
import { cn } from "@/lib/utils"

export type PillItem = { value: string; label: string; count?: number }

/**
 * Filtro por pílulas, renderizado no servidor: cada pílula é um link
 * (`?param=valor`), então funciona sem JS, com o botão Voltar e em links
 * compartilhados. `todos` (o valor padrão) não escreve nada na URL. Volta para
 * a página 1 ao trocar de filtro, mas preserva `params` (ex.: a busca).
 */
export function FilterPills({
  items,
  active,
  basePath,
  param = "status",
  params = {},
  label,
}: {
  items: PillItem[]
  active: string
  basePath: string
  param?: string
  params?: Record<string, string | undefined>
  label: string
}) {
  const href = (value: string) => {
    const search = new URLSearchParams()
    for (const [key, v] of Object.entries(params)) if (v) search.set(key, v)
    if (value !== "todos") search.set(param, value)
    const qs = search.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }

  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-2">
        {items.map((item) => {
          const isActive = item.value === active
          return (
            <li key={item.value}>
              <Link
                href={href(item.value)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors",
                  isActive
                    ? "border-primary bg-primary/15 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                {item.label}
                {item.count !== undefined ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {item.count}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
