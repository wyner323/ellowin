"use client"

import { useId, useState, useTransition } from "react"
import { toast } from "sonner"
import { setMonthlyGoal } from "@/app/actions/seller-goal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** "500000" centavos → "5.000,00" (o formato que a ação entende). */
function toInput(cents: number | null) {
  if (cents === null) return ""
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function GoalForm({ initialCents }: { initialCents: number | null }) {
  const id = useId()
  const [value, setValue] = useState(toInput(initialCents))
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(amount: string) {
    setError(null)
    start(async () => {
      const result = await setMonthlyGoal(amount)
      if (result.ok) {
        toast.success(result.message ?? "Meta salva.")
        if (amount.trim() === "") setValue("")
      } else {
        setError(result.error ?? "Não foi possível salvar a meta.")
      }
    })
  }

  return (
    <form
      className="flex flex-col gap-2 border-t border-border pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit(value)
      }}
    >
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {initialCents === null ? "Meta de receita líquida do mês (R$)" : "Alterar a meta do mês (R$)"}
      </label>
      <div className="flex flex-wrap items-start gap-2">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="5.000,00"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-erro` : undefined}
          className="h-9 w-40"
          maxLength={14}
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvando…" : initialCents === null ? "Definir meta" : "Salvar"}
        </Button>
        {initialCents !== null ? (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => submit("")}>
            Remover meta
          </Button>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-erro`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}
