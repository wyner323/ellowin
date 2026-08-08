"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Loader2, PackageCheck, XCircle } from "lucide-react"
import { cancelOrder, confirmReceipt, markDelivered } from "@/app/actions/orders"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/**
 * Ações de um pedido, filtradas por papel:
 * - vendedor registra a entrega enquanto o pedido aguarda entrega;
 * - comprador confirma o recebimento e libera a custódia;
 * - ambos podem cancelar antes de qualquer entrega.
 */
export function OrderActions({
  orderId,
  status,
  isBuyer,
  isSeller,
}: {
  orderId: number
  status: string
  isBuyer: boolean
  isSeller: boolean
}) {
  const router = useRouter()
  const [payload, setPayload] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    start(async () => {
      const result = await action()
      if (!result.ok) {
        setError(result.error ?? "Não foi possível concluir a ação.")
        return
      }
      router.refresh()
    })
  }

  const canCancel = status === "aguardando_entrega" && (isBuyer || isSeller)

  return (
    <div className="flex flex-col gap-4">
      {isSeller && status === "aguardando_entrega" ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="payload" className="text-sm font-medium">
            Dados da entrega
          </label>
          <Textarea
            id="payload"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder="Login, senha, código de resgate ou instruções combinadas com o comprador."
            rows={4}
            disabled={pending}
          />
          <Button
            onClick={() => run(() => markDelivered({ orderId, payload }))}
            disabled={pending || payload.trim().length < 4}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PackageCheck className="size-4" />
            )}
            Registrar entrega
          </Button>
        </div>
      ) : null}

      {isBuyer && status === "entregue" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Confira os dados recebidos antes de confirmar. A confirmação libera o
            pagamento ao vendedor e não pode ser desfeita.
          </p>
          <Button onClick={() => run(() => confirmReceipt(orderId))} disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Confirmar recebimento
          </Button>
        </div>
      ) : null}

      {canCancel ? (
        <Button
          variant="outline"
          onClick={() => run(() => cancelOrder(orderId))}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <XCircle className="size-4" />
          )}
          Cancelar pedido
        </Button>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
