"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Archive, Gavel, Loader2, UserCheck } from "lucide-react"
import { claimReport, resolveReport } from "@/app/actions/reports"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/**
 * Decisão da moderação sobre uma denúncia — mesmo padrão de ResolveDispute,
 * mas sem mexer em dinheiro: só confirma a irregularidade (fica registrado
 * contra o alvo, para casos futuros) ou arquiva sem achar nada.
 */
export function ResolveReport({ reportId, claimed }: { reportId: number; claimed: boolean }) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function decide(status: "resolvida" | "arquivada") {
    setError(null)
    start(async () => {
      const result = await resolveReport({ reportId, status, note })
      if (!result.ok) {
        setError(result.error ?? "Não foi possível encerrar a denúncia.")
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
              await claimReport(reportId)
              router.refresh()
            })
          }
          className="self-start"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
          Assumir o caso
        </Button>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="report-note">Nota da apuração</Label>
        <Textarea
          id="report-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Registre o que foi apurado. Fica só para a moderação — o denunciante e o denunciado não veem esta nota."
          rows={3}
          disabled={pending}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => decide("resolvida")} disabled={pending || note.trim().length < 5}>
          <Gavel className="size-4" />
          Confirmar irregularidade
        </Button>
        <Button
          variant="outline"
          onClick={() => decide("arquivada")}
          disabled={pending || note.trim().length < 5}
        >
          <Archive className="size-4" />
          Arquivar sem irregularidade
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
