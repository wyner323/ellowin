"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, Loader2, Lock, ShieldCheck, Wallet } from "lucide-react"
import { purchase } from "@/app/actions/orders"
import { Button } from "@/components/ui/button"
import { formatCents } from "@/lib/money"
import { cn } from "@/lib/utils"

type Variant = {
  id: number
  label: string
  priceCents: number
  stock: number
  deliveryNote: string | null
}

/**
 * Seleção do item específico, no estilo GGMax: o comprador escolhe uma das
 * opções do anúncio e cada uma tem preço e estoque próprios.
 *
 * Só o `id` da variante é enviado ao servidor — o preço é recalculado lá.
 */
export function VariantPicker({
  variants,
  isAuthenticated,
  isOwnProduct,
  availableCents,
}: {
  variants: Variant[]
  isAuthenticated: boolean
  isOwnProduct: boolean
  availableCents: number
}) {
  const router = useRouter()
  const inStock = variants.filter((v) => v.stock > 0)
  const [selectedId, setSelectedId] = useState<number | null>(inStock[0]?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const selected = variants.find((v) => v.id === selectedId) ?? null
  const insufficient = selected ? availableCents < selected.priceCents : false

  function buy() {
    if (!selected) return
    setError(null)

    start(async () => {
      const result = await purchase(selected.id)
      if (!result.ok) {
        setError(result.error ?? "Não foi possível concluir a compra.")
        return
      }
      router.push(`/pedidos/${result.orderId}`)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 text-sm font-semibold">Escolha o item</legend>

        {variants.map((variant) => {
          const disabled = variant.stock < 1
          const active = variant.id === selectedId

          return (
            <label
              key={variant.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/60",
                disabled && "cursor-not-allowed opacity-55 hover:border-border",
              )}
            >
              <input
                type="radio"
                name="variant"
                value={variant.id}
                checked={active}
                disabled={disabled}
                onChange={() => setSelectedId(variant.id)}
                className="sr-only"
              />
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
                aria-hidden="true"
              >
                {active ? <Check className="size-3" /> : null}
              </span>

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{variant.label}</span>
                <span className="text-xs text-muted-foreground">
                  {disabled
                    ? "Esgotado"
                    : variant.stock === 1
                      ? "1 unidade disponível"
                      : `${variant.stock} unidades disponíveis`}
                  {variant.deliveryNote ? ` · ${variant.deliveryNote}` : ""}
                </span>
              </span>

              <span className="shrink-0 font-display text-sm font-bold">
                {formatCents(variant.priceCents)}
              </span>
            </label>
          )
        })}
      </fieldset>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="font-display text-2xl font-bold">
            {selected ? formatCents(selected.priceCents) : "—"}
          </span>
        </div>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          O valor fica retido em custódia. O vendedor só recebe depois que você
          confirmar a entrega.
        </p>

        {!isAuthenticated ? (
          <Button render={<Link href="/entrar" />} className="w-full">
            <Lock className="size-4" />
            Entrar para comprar
          </Button>
        ) : isOwnProduct ? (
          <p className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
            Este é o seu anúncio. Você não pode comprá-lo.
          </p>
        ) : inStock.length === 0 ? (
          <Button disabled className="w-full">
            Sem estoque
          </Button>
        ) : insufficient ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-destructive">
              Saldo disponível de {formatCents(availableCents)} — insuficiente para
              este item.
            </p>
            <Button render={<Link href="/carteira" />} variant="outline" className="w-full">
              <Wallet className="size-4" />
              Adicionar saldo
            </Button>
          </div>
        ) : (
          <Button onClick={buy} disabled={pending || !selected} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Comprar agora
          </Button>
        )}

        {isAuthenticated && !isOwnProduct ? (
          <p className="text-center text-xs text-muted-foreground">
            Saldo disponível: {formatCents(availableCents)}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
