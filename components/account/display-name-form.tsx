"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { updateDisplayName } from "@/app/actions/account"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function DisplayNameForm({ initialValue }: { initialValue: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initialValue)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  const dirty = value.trim() !== initialValue.trim()

  function save() {
    setFeedback(null)
    start(async () => {
      const result = await updateDisplayName({ displayName: value })
      if (!result.ok) {
        setFeedback({ ok: false, text: result.error ?? "Não foi possível salvar." })
        return
      }
      setFeedback({ ok: true, text: "Apelido atualizado." })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="displayName" className="text-xs text-muted-foreground">
        Apelido público
      </label>
      <div className="flex gap-2">
        <Input
          id="displayName"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Como quer ser chamado no site"
          maxLength={20}
          disabled={pending}
          className="max-w-56"
        />
        <Button size="sm" onClick={save} disabled={pending || !dirty || value.trim().length < 2}>
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Salvar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Aparece no chat, nas avaliações e nos seus anúncios — seu nome legal
        continua privado.
      </p>
      {feedback ? (
        <p
          role={feedback.ok ? undefined : "alert"}
          className={`text-xs ${feedback.ok ? "text-primary" : "text-destructive"}`}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  )
}
