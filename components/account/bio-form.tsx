"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { updateBio } from "@/app/actions/account"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const MAX_LENGTH = 160

export function BioForm({ initialValue }: { initialValue: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initialValue)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  const dirty = value.trim() !== initialValue.trim()

  function save() {
    setFeedback(null)
    start(async () => {
      const result = await updateBio({ bio: value })
      if (!result.ok) {
        setFeedback({ ok: false, text: result.error ?? "Não foi possível salvar." })
        return
      }
      setFeedback({ ok: true, text: "Bio atualizada." })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="bio" className="text-xs text-muted-foreground">
        Bio
      </label>
      <Textarea
        id="bio"
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_LENGTH))}
        placeholder="Uma frase curta sobre você ou sua loja"
        rows={2}
        disabled={pending}
        className="max-w-md resize-none"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Aparece no seu perfil e na sua loja.</p>
        <span
          className={cn(
            "text-[0.65rem] text-muted-foreground",
            value.length >= MAX_LENGTH && "text-destructive",
          )}
        >
          {value.length}/{MAX_LENGTH}
        </span>
      </div>
      <Button size="sm" onClick={save} disabled={pending || !dirty} className="self-start">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        Salvar bio
      </Button>
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
