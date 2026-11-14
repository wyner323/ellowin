"use client"

import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { decideCategoryApproval, setStockReview } from "@/app/actions/category-approval"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** Aprovar ou recusar o pedido de um vendedor numa categoria (recusar exige o motivo, que o vendedor lê). */
export function CategoryDecision({ approvalId, stockReviewDefault }: { approvalId: number; stockReviewDefault: boolean }) {
  const id = useId()
  const router = useRouter()
  const [note, setNote] = useState("")
  const [stockReview, setStockReviewState] = useState(stockReviewDefault)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function decide(decision: "aprovado" | "recusado") {
    setError(null)
    start(async () => {
      const result = await decideCategoryApproval({ approvalId, decision, note, stockReview })
      if (result.ok) {
        toast.success(result.message ?? "Decisão registrada.")
        router.refresh()
      } else {
        setError(result.error ?? "Não foi possível registrar a decisão.")
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${id}-nota`} className="text-xs font-medium text-muted-foreground">
        Observação para o vendedor (obrigatória ao recusar)
      </label>
      <Input id={`${id}-nota`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} disabled={pending} />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={stockReview} onChange={(e) => setStockReviewState(e.target.checked)} disabled={pending} />
        Analisar o estoque novo deste vendedor antes de entrar à venda
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => decide("aprovado")} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Aprovar
        </Button>
        <Button size="sm" variant="outline" onClick={() => decide("recusado")} disabled={pending}>
          Recusar
        </Button>
      </div>
    </div>
  )
}

/** Liga ou desliga a análise do estoque novo de um vendedor já aprovado. */
export function StockReviewToggle({ approvalId, stockReview }: { approvalId: number; stockReview: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function toggle() {
    start(async () => {
      const result = await setStockReview({ approvalId, stockReview: !stockReview })
      if (result.ok) {
        toast.success(result.message ?? "Atualizado.")
        router.refresh()
      } else {
        toast.error(result.error ?? "Não foi possível atualizar.")
      }
    })
  }

  return (
    <Button size="sm" variant="outline" onClick={toggle} disabled={pending}>
      {stockReview ? "Dispensar análise do estoque" : "Voltar a analisar o estoque"}
    </Button>
  )
}
