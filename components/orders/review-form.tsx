"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Star } from "lucide-react"
import { submitReview } from "@/app/actions/reviews"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const HINTS: Record<number, string> = {
  1: "Péssimo — não recebi o que esperava",
  2: "Ruim — vários problemas",
  3: "Regular — resolveu, mas com atrito",
  4: "Bom — entrega correta",
  5: "Excelente — rápido e exatamente como anunciado",
}

/**
 * Avaliação pós-compra. A nota escolhida aqui alimenta a média do vendedor,
 * que é o que ordena o ranking de qualidade na vitrine.
 */
export function ReviewForm({ orderId }: { orderId: number }) {
  const router = useRouter()
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const shown = hover || rating

  function send() {
    setError(null)
    start(async () => {
      const result = await submitReview({ orderId, rating, comment })
      if (!result.ok) {
        setError(result.error ?? "Não foi possível registrar a avaliação.")
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Sua nota para o vendedor</legend>

        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              disabled={pending}
              aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
              aria-pressed={rating === n}
              className="rounded-md p-0.5 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
            >
              <Star
                className={cn(
                  "size-7",
                  n <= shown
                    ? "fill-chart-4 text-chart-4"
                    : "text-muted-foreground/40",
                )}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>

        <p className="min-h-5 text-xs text-muted-foreground">
          {shown ? HINTS[shown] : "Escolha de 1 a 5 estrelas."}
        </p>
      </fieldset>

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Conte como foi a entrega e o atendimento (opcional)."
        rows={3}
        disabled={pending}
        aria-label="Comentário da avaliação"
      />

      <Button onClick={send} disabled={pending || rating === 0} className="self-start">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Enviar avaliação
      </Button>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
