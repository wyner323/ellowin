"use client"

import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { deleteReviewReply, replyToReview } from "@/app/actions/review-replies"
import { CannedReplies } from "@/components/seller/canned-replies"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { REVIEW_REPLIES, appendReply } from "@/lib/canned-replies"
import { MAX_REPLY, MIN_REPLY } from "@/lib/review-reply-rules"

/** Responder (ou editar a resposta de) uma avaliação recebida. A resposta é pública, e o texto fica só na caixa até enviar. */
export function ReviewReplyForm({ reviewId, initial }: { reviewId: number; initial: string }) {
  const id = useId()
  const router = useRouter()
  const [text, setText] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const has = initial !== ""
  const length = text.trim().length

  function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) {
    setError(null)
    start(async () => {
      const result = await action()
      if (result.ok) {
        toast.success(result.message ?? "Pronto.")
        after?.()
        router.refresh()
      } else {
        setError(result.error ?? "Não foi possível salvar a resposta.")
      }
    })
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        run(() => replyToReview(reviewId, text))
      }}
    >
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {has ? "Editar a sua resposta (pública)" : "Responder (a resposta é pública)"}
      </label>
      <Textarea
        id={id}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        maxLength={MAX_REPLY}
        disabled={pending}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-erro` : undefined}
      />
      <CannedReplies label="Respostas prontas" replies={REVIEW_REPLIES} onPick={(t) => setText((cur) => appendReply(cur, t).slice(0, MAX_REPLY))} disabled={pending} />
      {error ? (
        <p id={`${id}-erro`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || length < MIN_REPLY || text.trim() === initial}>
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
          {has ? "Salvar resposta" : "Publicar resposta"}
        </Button>
        {has ? (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteReviewReply(reviewId), () => setText(""))}>
            Apagar resposta
          </Button>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {length}/{MAX_REPLY}
        </span>
      </div>
    </form>
  )
}
