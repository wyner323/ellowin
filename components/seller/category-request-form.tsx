"use client"

import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { requestCategoryApproval } from "@/app/actions/category-approval"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MAX_STATEMENT, MIN_STATEMENT } from "@/lib/category-rules"

/** Pedido (ou novo pedido, depois de uma recusa) de aprovação numa categoria restrita. A explicação é do vendedor e a Ellowin não a confere. */
export function CategoryRequestForm({
  categorySlug,
  prompt,
  initial = "",
  buttonLabel,
}: {
  categorySlug: string
  prompt: string
  initial?: string
  buttonLabel: string
}) {
  const id = useId()
  const router = useRouter()
  const [statement, setStatement] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    setError(null)
    start(async () => {
      const result = await requestCategoryApproval({ categorySlug, statement })
      if (result.ok) {
        toast.success(result.message ?? "Pedido enviado.")
        router.refresh()
      } else {
        setError(result.error ?? "Não foi possível enviar o pedido.")
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {prompt}
      </label>
      <Textarea
        id={id}
        value={statement}
        onChange={(event) => setStatement(event.target.value)}
        rows={4}
        maxLength={MAX_STATEMENT}
        disabled={pending}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-ajuda`}
      />
      <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
        De {MIN_STATEMENT} a {MAX_STATEMENT} caracteres ({statement.trim().length} agora). A moderação lê isto para decidir; a Ellowin não confere a informação.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button onClick={submit} disabled={pending || statement.trim().length < MIN_STATEMENT}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {buttonLabel}
        </Button>
      </div>
    </div>
  )
}
