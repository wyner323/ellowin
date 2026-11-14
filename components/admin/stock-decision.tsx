"use client"

import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { reviewStockBatch } from "@/app/actions/stock-review"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** Decisão da moderação sobre um lote: aprovar (entra à venda), recusar (apaga os itens não vendidos) ou retirar da venda (quarentena). */
export function StockDecision({ batchId, status }: { batchId: number; status: "pendente" | "aprovado" | "recusado" | "quarentena" }) {
  const id = useId()
  const router = useRouter()
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function decide(decision: "aprovado" | "recusado" | "quarentena") {
    setError(null)
    start(async () => {
      const result = await reviewStockBatch({ batchId, decision, note })
      if (result.ok) {
        toast.success(result.message ?? "Decisão registrada.")
        router.refresh()
      } else {
        setError(result.error ?? "Não foi possível registrar a decisão.")
      }
    })
  }

  const canApprove = status === "pendente" || status === "quarentena"
  const canReject = status === "pendente" || status === "quarentena"
  const canQuarantine = status === "aprovado"

  if (!canApprove && !canQuarantine) return null

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${id}-nota`} className="text-xs font-medium text-muted-foreground">
        Observação para o vendedor (obrigatória ao recusar ou retirar)
      </label>
      <Input id={`${id}-nota`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} disabled={pending} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canApprove ? (
          <Button size="sm" onClick={() => decide("aprovado")} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Aprovar
          </Button>
        ) : null}
        {canReject ? (
          <Button size="sm" variant="outline" onClick={() => decide("recusado")} disabled={pending}>
            Recusar e apagar
          </Button>
        ) : null}
        {canQuarantine ? (
          <Button size="sm" variant="outline" onClick={() => decide("quarentena")} disabled={pending}>
            Retirar da venda
          </Button>
        ) : null}
      </div>
    </div>
  )
}
