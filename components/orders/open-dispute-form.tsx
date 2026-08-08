"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ShieldAlert } from "lucide-react"
import { openDispute } from "@/app/actions/disputes"
import { DISPUTE_REASONS } from "@/lib/disputes"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatCents } from "@/lib/money"

/**
 * Abertura de disputa pelo comprador.
 *
 * O aviso deixa explícito o que foi acordado: apenas o valor deste pedido fica
 * bloqueado, não o saldo inteiro do vendedor.
 */
export function OpenDisputeForm({
  orderId,
  amountCents,
}: {
  orderId: number
  amountCents: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function send() {
    setError(null)
    start(async () => {
      const result = await openDispute({ orderId, reason, description })
      if (!result.ok) {
        setError(result.error ?? "Não foi possível abrir a disputa.")
        return
      }
      router.push(`/pedidos/${orderId}/disputa`)
    })
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} className="self-start">
        <ShieldAlert className="size-4" />
        Tenho um problema com este pedido
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Abrir disputa</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {formatCents(amountCents)} deste pedido continuam bloqueados em custódia
          até a resolução — o restante do saldo do vendedor não é afetado. O
          vendedor tem 48h úteis para resolver e o suporte da Ellowin entra no caso
          em até 24h.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="reason">Motivo</Label>
        <Select value={reason} onValueChange={(value) => setReason(value ?? "")}>
          <SelectTrigger id="reason">
            <SelectValue placeholder="Selecione o motivo" />
          </SelectTrigger>
          <SelectContent>
            {DISPUTE_REASONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">O que aconteceu</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva o problema com detalhes: o que foi combinado, o que você recebeu e o que já tentou resolver."
          rows={4}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          {description.trim().length}/20 caracteres mínimos
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={send}
          disabled={pending || !reason || description.trim().length < 20}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Abrir disputa
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Voltar
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
