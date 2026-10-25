"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Heart, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { toggleFavorite } from "@/app/actions/favorites"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Guardar o anúncio nos favoritos (coração). Quem não entrou vê um link para o login que volta ao anúncio. O estado vem
 * do servidor e muda na hora; o texto muda junto com o ícone (nunca só cor) e o botão informa o estado a leitores de tela.
 */
export function FavoriteButton({
  productId,
  initial,
  signInHref,
}: {
  productId: number
  initial: boolean
  /** nulo quando a pessoa está logada; senão, o caminho de login que volta para esta página */
  signInHref: string | null
}) {
  const [favorite, setFavorite] = useState(initial)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (signInHref) {
    return (
      <Button render={<Link href={signInHref} />} variant="outline" size="sm">
        <Heart className="size-4" aria-hidden="true" />
        Guardar nos favoritos
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        aria-pressed={favorite}
        disabled={pending}
        onClick={() => {
          setError(null)
          start(async () => {
            const result = await toggleFavorite(productId)
            if (result.ok && typeof result.favorite === "boolean") {
              setFavorite(result.favorite)
              toast.success(result.message ?? (result.favorite ? "Guardado." : "Removido."))
            } else {
              setError(result.error ?? "Não foi possível alterar os favoritos.")
            }
          })
        }}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Heart className={cn("size-4", favorite && "fill-current text-primary")} aria-hidden="true" />
        )}
        {favorite ? "Nos favoritos" : "Guardar nos favoritos"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
