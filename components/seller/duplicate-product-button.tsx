"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Copy, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { duplicateProduct } from "@/app/actions/products"
import { Button } from "@/components/ui/button"

/** Cria uma cópia pausada do anúncio e abre a edição dela. A cópia não leva fotos e começa com estoque zero. */
export function DuplicateProductButton({ productId }: { productId: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null)
          start(async () => {
            const result = await duplicateProduct(productId)
            if (!result.ok || !result.id) {
              setError(result.error ?? "Não foi possível duplicar o anúncio.")
              return
            }
            toast.success(result.message ?? "Anúncio duplicado.")
            router.push(`/painel/vendedor/produtos/${result.id}`)
          })
        }}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        Duplicar
      </Button>
      {error ? (
        <p role="alert" className="max-w-48 text-right text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
