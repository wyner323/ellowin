"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Gamepad2, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { Game } from "@/lib/product-catalog"

export function GamesIndex({
  games,
  counts,
}: {
  games: Game[]
  counts: Record<string, number>
}) {
  const [query, setQuery] = useState("")

  const sorted = useMemo(
    () =>
      [...games].sort((a, b) => {
        const diff = (counts[b.slug] ?? 0) - (counts[a.slug] ?? 0)
        return diff !== 0 ? diff : a.name.localeCompare(b.name, "pt-BR")
      }),
    [games, counts],
  )

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return sorted
    return sorted.filter((g) => g.name.toLowerCase().includes(term))
  }, [sorted, query])

  return (
    <div className="flex flex-col gap-6">
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar jogo..."
          className="h-10 pl-9"
          aria-label="Buscar jogo"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum jogo encontrado para "{query}".
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((game) => {
            const count = counts[game.slug] ?? 0
            return (
              <Link
                key={game.slug}
                href={`/jogos/${game.slug}`}
                className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-3 text-sm transition-colors hover:border-primary"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Gamepad2
                    className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                    aria-hidden="true"
                  />
                  <span className="truncate font-medium">{game.name}</span>
                </span>
                {count > 0 ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {count}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
