"use client"

import { useMemo, useState } from "react"
import { ArrowLeft, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  GAMES,
  OUTRAS_CATEGORIAS,
  productKindsForGame,
  type Game,
} from "@/lib/product-catalog"

const ALL_ENTRIES: Game[] = [...GAMES, ...OUTRAS_CATEGORIAS]
const MAX_RESULTS = 24

export type PickerSelection = {
  categorySlug: string
  game: string
  title: string
  variants: string[]
  deliveryType: "manual" | "automatica"
  deliveryTime: string
}

/**
 * Seletor guiado jogo → tipo de produto, no estilo GGMax: busca o jogo (a
 * lista tem quase 190 entradas, não cabe numa grade de chips), depois mostra
 * os tipos de produto daquele jogo. A seleção só *sugere* — o vendedor edita
 * tudo livremente depois no formulário.
 */
export function GameProductPicker({
  defaultGame,
  onSelect,
  onManual,
}: {
  defaultGame?: string
  onSelect: (selection: PickerSelection) => void
  onManual: () => void
}) {
  const preselected = defaultGame
    ? ALL_ENTRIES.find((g) => g.name.toLowerCase() === defaultGame.toLowerCase())
    : undefined

  const [query, setQuery] = useState("")
  const [selectedGame, setSelectedGame] = useState<Game | null>(preselected ?? null)

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    const source = term ? ALL_ENTRIES.filter((g) => g.name.toLowerCase().includes(term)) : ALL_ENTRIES
    return source.slice(0, MAX_RESULTS)
  }, [query])

  if (!selectedGame) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">O que você vai anunciar?</h2>
          <p className="text-xs text-muted-foreground">
            Escolha o jogo (ou categoria) e a gente já monta um rascunho do
            anúncio pra você ajustar.
          </p>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busque o jogo... ex.: Valorant, GTA, Gift Cards"
            className="h-10 pl-9"
            autoFocus
          />
        </div>

        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {results.map((g) => (
            <button
              key={g.slug}
              type="button"
              onClick={() => setSelectedGame(g)}
              className="truncate rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:text-primary"
            >
              {g.name}
            </button>
          ))}
          {results.length === 0 ? (
            <p className="col-span-full py-4 text-center text-sm text-muted-foreground">
              Nenhum resultado para "{query}".
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onManual}
          className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          Prefiro preencher manualmente
        </button>
      </div>
    )
  }

  const kinds = productKindsForGame(selectedGame)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedGame(null)}
          aria-label="Voltar pra busca de jogo"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold">{selectedGame.name}</h2>
          <p className="text-xs text-muted-foreground">O que você vai vender?</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {kinds.map((kind) => (
          <button
            key={kind.id}
            type="button"
            onClick={() =>
              onSelect({
                categorySlug: kind.categorySlug,
                game: selectedGame.name,
                title: kind.titleTemplate(selectedGame.name),
                variants: kind.starterVariants,
                deliveryType: kind.deliveryType,
                deliveryTime: kind.deliveryTime,
              })
            }
            className="rounded-full border border-border bg-background px-3.5 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"
          >
            {kind.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onManual}
        className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        Prefiro preencher manualmente
      </button>
    </div>
  )
}
