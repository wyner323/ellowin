"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Gavel, Loader2, UserCheck } from "lucide-react"
import { claimDispute, resolveDispute } from "@/app/actions/disputes"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatCents } from "@/lib/money"

/**
 * Decisão final da moderação.
 *
 * Os dois desfechos movem o valor em custódia: `comprador` devolve o total ao
 * comprador, `vendedor` libera o líquido ao vendedor. A justificativa é
 * obrigatória e entra no histórico do caso.
 */
export function ResolveDispute({
  disputeId,
  amountCents,
  sellerNetCents,
  claimed,
}: {
  disputeId: number
  amountCents: number
  sellerNetCents: number
  claimed: boolean
}) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function decide(outcome: "comprador" | "vendedor") {
    setError(null)
    start(async () => {
      const result = await resolveDispute({ disputeId, outcome, note })
      if (!result.ok) {
        setError(result.error ?? "Não foi possível encerrar a disputa.")
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {!claimed ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await claimDispute(disputeId)
              router.refresh()
            })
          }
          className="self-start"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UserCheck className="size-4" />
          )}
          Assumir o caso
        </Button>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="note">Justificativa da decisão</Label>
        <Textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Registre o que foi apurado e a base da decisão. Fica visível no histórico para as partes e para os demais moderadores."
          rows={3}
          disabled={pending}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => decide("comprador")}
          disabled={pending || note.trim().length < 10}
        >
          <Gavel className="size-4" />
          Reembolsar {formatCents(amountCents)} ao comprador
        </Button>
        <Button
          variant="outline"
          onClick={() => decide("vendedor")}
          disabled={pending || note.trim().length < 10}
        >
          Liberar {formatCents(sellerNetCents)} ao vendedor
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
