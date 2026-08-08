"use client"

import { useTransition } from "react"
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
  const paused = status !== "ativo"

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={paused ? "Reativar anúncio" : "Pausar anúncio"}
      onClick={() =>
        start(async () => {
          await toggleProductStatus(productId)
          router.refresh()
        })
      }
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : paused ? (
        <Play className="size-4" />
      ) : (
        <Pause className="size-4" />
      )}
    </Button>
  )
}
