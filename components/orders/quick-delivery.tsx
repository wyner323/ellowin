"use client"

import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, PackageCheck } from "lucide-react"
import { toast } from "sonner"
import { markDelivered } from "@/app/actions/orders"
import { DeliveryCountdown } from "@/components/orders/delivery-countdown"
import { CannedReplies } from "@/components/seller/canned-replies"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { DELIVERY_TEMPLATES, appendReply } from "@/lib/canned-replies"

/**
 * Entrega direta pela lista de vendas: o contador do prazo e, ao abrir, a caixa de dados com modelos prontos. Usa a
 * mesma ação do pedido (`markDelivered`), então as regras são as mesmas: só o vendedor, só enquanto aguarda entrega.
 */
export function QuickDelivery({ orderId, dueAt }: { orderId: number; dueAt: string | null }) {
  const id = useId()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [payload, setPayload] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    setError(null)
    start(async () => {
      const result = await markDelivered({ orderId, payload })
      if (result.ok) {
        toast.success(result.message ?? "Entrega registrada.")
        setPayload("")
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error ?? "Não foi possível registrar a entrega.")
      }
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {dueAt ? <DeliveryCountdown dueAt={dueAt} /> : <span className="text-sm text-muted-foreground">Sem prazo definido: entregue o quanto antes.</span>}
        <Button
          type="button"
          size="sm"
          variant={open ? "ghost" : "default"}
          aria-expanded={open}
          aria-controls={`${id}-form`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Fechar" : "Entregar agora"}
        </Button>
      </div>

      {open ? (
        <form
          id={`${id}-form`}
          className="flex flex-col gap-2 border-t border-border pt-3"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <label htmlFor={`${id}-dados`} className="text-sm font-medium">
            Dados da entrega
          </label>
          <CannedReplies label="Modelos" replies={DELIVERY_TEMPLATES} onPick={(t) => setPayload((cur) => appendReply(cur, t))} disabled={pending} />
          <Textarea
            id={`${id}-dados`}
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="Login, senha, código de resgate ou instruções combinadas com o comprador."
            disabled={pending}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-ajuda`}
          />
          <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
            Os dados ficam dentro do pedido e não vão por e-mail. Registrar a entrega avisa o comprador e começa o prazo para ele conferir.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div>
            <Button type="submit" size="sm" disabled={pending || payload.trim().length < 4}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PackageCheck className="size-4" aria-hidden="true" />}
              Registrar entrega
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
