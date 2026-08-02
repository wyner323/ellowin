"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react"
import { addFunds, requestWithdrawal } from "@/app/actions/wallet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Depósito e saque da carteira interna.
 *
 * O depósito é simulado (não há gateway): serve para o comprador ter saldo e
 * exercitar o fluxo de custódia de ponta a ponta.
 */
export function WalletForms({ availableCents }: { availableCents: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <MoneyForm
        title="Adicionar saldo"
        description="Depósito simulado para testar compras."
        submitLabel="Adicionar"
        icon="in"
        action={addFunds}
      />
      <MoneyForm
        title="Solicitar saque"
        description="Retira do saldo disponível — valores em custódia não entram."
        submitLabel="Sacar"
        icon="out"
        action={requestWithdrawal}
        disabled={availableCents <= 0}
      />
    </div>
  )
}

function MoneyForm({
  title,
  description,
  submitLabel,
  icon,
  action,
  disabled,
}: {
  title: string
  description: string
  submitLabel: string
  icon: "in" | "out"
  action: (amount: string) => Promise<{ ok: boolean; error?: string; message?: string }>
  disabled?: boolean
}) {
  const [amount, setAmount] = useState("")
  const [pending, start] = useTransition()

  const fieldId = `amount-${icon}`

  function submit(event: React.FormEvent) {
    event.preventDefault()

    start(async () => {
      const result = await action(amount)

      if (result.ok) {
        toast.success(result.message ?? "Operação concluída.")
        setAmount("")
      } else {
        toast.error(result.error ?? "Não foi possível concluir.")
      }
    })
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon === "in" ? (
            <ArrowDownToLine className="size-4" aria-hidden="true" />
          ) : (
            <ArrowUpFromLine className="size-4" aria-hidden="true" />
          )}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId} className="text-xs">
          Valor em reais
        </Label>
        <Input
          id={fieldId}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="150,00"
          inputMode="decimal"
          disabled={pending || disabled}
        />
      </div>

      <Button type="submit" size="sm" disabled={pending || disabled || !amount.trim()}>
        {pending ? "Processando..." : submitLabel}
      </Button>
    </form>
  )
}
