"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Flag, Loader2 } from "lucide-react"
import { reportListing, reportUser } from "@/app/actions/reports"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { MAX_REPORT_DESCRIPTION, MIN_REPORT_DESCRIPTION, REPORT_REASONS } from "@/lib/reports"

type Target = { type: "anuncio"; productId: number } | { type: "usuario"; targetUserId: string }

const REASON_ITEMS = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]))

/**
 * Link discreto que abre um formulário de denúncia inline — mesmo padrão do
 * OpenDisputeForm (revela o formulário em vez de navegar pra outra página).
 * Um componente só serve os dois alvos (anúncio ou usuário) pra não duplicar
 * a lógica de motivo/descrição/estado de sucesso.
 */
export function ReportButton({ target, label }: { target: Target; label: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  if (done) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-success">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        Denúncia enviada. Nossa equipe vai analisar.
      </p>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
      >
        <Flag className="size-3" aria-hidden="true" />
        {label}
      </button>
    )
  }

  function submit() {
    setError(null)
    start(async () => {
      const result =
        target.type === "anuncio"
          ? await reportListing({ productId: target.productId, reason, description })
          : await reportUser({ targetUserId: target.targetUserId, reason, description })

      if (!result.ok) {
        setError(result.error ?? "Não foi possível enviar a denúncia.")
        return
      }
      setDone(true)
    })
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-xs font-semibold">
        {target.type === "anuncio" ? "Denunciar este anúncio" : "Denunciar este usuário"}
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report-reason" className="text-xs">
          Motivo
        </Label>
        <Select items={REASON_ITEMS} value={reason} onValueChange={(value) => setReason(value ?? "")}>
          <SelectTrigger id="report-reason" className="h-9 text-sm">
            <SelectValue placeholder="Selecione o motivo" />
          </SelectTrigger>
          <SelectContent>
            {REPORT_REASONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="report-description" className="text-xs">
          O que aconteceu
        </Label>
        <Textarea
          id="report-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva o que você viu ou viveu — quanto mais detalhe, mais rápido analisamos."
          rows={3}
          maxLength={MAX_REPORT_DESCRIPTION}
          disabled={pending}
        />
        <p className="text-[0.7rem] text-muted-foreground">
          {description.trim().length < MIN_REPORT_DESCRIPTION
            ? `Faltam ${MIN_REPORT_DESCRIPTION - description.trim().length} caracteres para o mínimo.`
            : `${description.trim().length}/${MAX_REPORT_DESCRIPTION} caracteres.`}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending || !reason || description.trim().length < MIN_REPORT_DESCRIPTION}
          onClick={submit}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Enviar denúncia
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
