"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Heart, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { toggleFavorite } from "@/app/actions/favorites"
import { Button } from "@/components/ui/button"

/** "Remover" na lista de favoritos: tira o anúncio e atualiza a lista. */
export function RemoveFavoriteButton({ productId, title }: { productId: number; title: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label={`Remover ${title} dos favoritos`}
        onClick={() => {
          setError(null)
          start(async () => {
            const result = await toggleFavorite(productId)
            if (result.ok) {
              // A ação alterna: se o anúncio já tinha saído da lista em outra aba, ela o guardaria de novo.
              if (result.favorite) toast.success("Guardado de novo nos favoritos.")
              else toast.success(result.message ?? "Removido dos favoritos.")
              router.refresh()
            } else {
              setError(result.error ?? "Não foi possível remover.")
            }
          })
        }}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Heart className="size-4 fill-current text-primary" aria-hidden="true" />}
        Remover
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
