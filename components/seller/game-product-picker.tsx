"use client"

import { useMemo, useState } from "react"
import {
  ArrowLeft,
  ChevronRight,
  Coins,
  Gamepad2,
  Gift,
  Rocket,
  Search,
  UserRound,
  type LucideIcon,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  GAMES,
  OUTRAS_CATEGORIAS,
  productKindsForGame,
  type Game,
  type ProductKindId,
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

const KIND_META: Record<ProductKindId, { icon: LucideIcon; description: string }> = {
  conta: { icon: UserRound, description: "Perfil pronto para jogar, com os dados de acesso" },
  moeda_ou_itens: { icon: Coins, description: "Moedas, gold, skins e itens do jogo" },
  boost_ou_servico: { icon: Rocket, description: "Elo, coaching, missões e outros serviços" },
  gift_card_ou_assinatura: { icon: Gift, description: "Cartões, códigos e assinaturas" },
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

  const term = query.trim().toLowerCase()
  const results = useMemo(() => {
    const source = term ? ALL_ENTRIES.filter((g) => g.name.toLowerCase().includes(term)) : ALL_ENTRIES
    return source.slice(0, MAX_RESULTS)
  }, [term])

  const manualLink = (
    <button
      type="button"
      onClick={onManual}
      className="self-start text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
    >
      Prefiro preencher manualmente
    </button>
  )

  if (!selectedGame) {
    return (
      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <header className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
            aria-hidden="true"
          >
            <Gamepad2 className="size-5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="font-display text-lg font-bold tracking-tight">O que você vai anunciar?</h2>
            <p className="text-sm text-muted-foreground">
              Escolha o jogo (ou categoria) e a gente monta um rascunho do anúncio pra você ajustar.
            </p>
          </div>
        </header>

        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busque o jogo... ex.: Valorant, GTA, Gift Cards"
            aria-label="Buscar jogo ou categoria"
            className="h-11 pl-10"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {term ? `Resultados para “${query.trim()}”` : "Jogos e categorias"}
          </span>
          <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((g) => (
              <button
                key={g.slug}
                type="button"
                onClick={() => setSelectedGame(g)}
                className="group flex items-center gap-2.5 rounded-xl border border-border bg-background p-2.5 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5"
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary"
                  aria-hidden="true"
                >
                  {g.name.charAt(0).toUpperCase()}
                </span>
                <span className="truncate font-medium">{g.name}</span>
              </button>
            ))}
            {results.length === 0 ? (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                Nenhum resultado para &quot;{query}&quot;. Se o seu jogo não está na lista, preencha
                manualmente.
              </p>
            ) : null}
          </div>
        </div>

        {manualLink}
      </div>
    )
  }

  const kinds = productKindsForGame(selectedGame)

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSelectedGame(null)}
          aria-label="Voltar pra busca de jogo"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="flex flex-col">
          <h2 className="font-display text-lg font-bold tracking-tight">{selectedGame.name}</h2>
          <p className="text-sm text-muted-foreground">O que você vai vender?</p>
        </div>
      </header>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {kinds.map((kind) => {
          const meta = KIND_META[kind.id]
          const Icon = meta.icon
          return (
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
              className="group flex items-center gap-3 rounded-xl border border-border bg-background p-3.5 text-left transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                aria-hidden="true"
              >
                <Icon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">{kind.label}</span>
                <span className="text-xs text-muted-foreground">{meta.description}</span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          )
        })}
      </div>

      {manualLink}
    </div>
  )
}
