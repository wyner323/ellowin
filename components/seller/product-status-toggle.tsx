"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Pause, Play } from "lucide-react"
import { toggleProductStatus } from "@/app/actions/products"
import { Button } from "@/components/ui/button"

/** Pausa ou reativa o anúncio sem sair da lista. */
export function ProductStatusToggle({
  productId,
  status,
}: {
  productId: number
  status: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const paused = status !== "ativo"

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label={paused ? "Reativar anúncio" : "Pausar anúncio"}
        onClick={() => {
          setError(null)
          start(async () => {
            const result = await toggleProductStatus(productId)
            if (!result.ok) {
              setError(result.error ?? "Não foi possível concluir a ação.")
              return
            }
            router.refresh()
          })
        }}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : paused ? (
          <Play className="size-4" />
        ) : (
          <Pause className="size-4" />
        )}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
