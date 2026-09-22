"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MessageCircleQuestion } from "lucide-react"
import { answerProductQuestion, askProductQuestion } from "@/app/actions/product-questions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { ProductQuestion } from "@/lib/marketplace"

/**
 * Perguntas públicas do anúncio — qualquer visitante logado pergunta, só o
 * dono do anúncio responde. Fica visível a todo mundo antes da compra, pra
 * tirar dúvida sem precisar abrir um pedido.
 */
export function ProductQuestions({
  productId,
  questions,
  isAuthenticated,
  isOwnProduct,
}: {
  productId: number
  questions: ProductQuestion[]
  isAuthenticated: boolean
  isOwnProduct: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submitQuestion() {
    setError(null)
    start(async () => {
      const result = await askProductQuestion(productId, draft)
      if (!result.ok) {
        setError(result.error ?? "Não foi possível enviar a pergunta.")
        return
      }
      setDraft("")
      router.refresh()
    })
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="perguntas">
      <h2 id="perguntas" className="flex items-center gap-2 text-lg font-semibold">
        <MessageCircleQuestion className="size-5" aria-hidden="true" />
        Perguntas sobre este anúncio
      </h2>

      {questions.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhuma pergunta até agora.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {questions.map((q) => (
            <QuestionItem key={q.id} question={q} isOwnProduct={isOwnProduct} />
          ))}
        </ul>
      )}

      {isAuthenticated && !isOwnProduct ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Pergunte algo pro vendedor antes de comprar…"
            rows={2}
            disabled={pending}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button size="sm" className="self-start" onClick={submitQuestion} disabled={pending || !draft.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Perguntar
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function QuestionItem({
  question,
  isOwnProduct,
}: {
  question: ProductQuestion
  isOwnProduct: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submitAnswer() {
    setError(null)
    start(async () => {
      const result = await answerProductQuestion(question.id, draft)
      if (!result.ok) {
        setError(result.error ?? "Não foi possível publicar a resposta.")
        return
      }
      router.refresh()
    })
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{question.askerName}</span>
        <span className="text-xs text-muted-foreground">
          {question.createdAt.toLocaleDateString("pt-BR")}
        </span>
      </div>
      <p className="text-sm leading-relaxed">{question.question}</p>

      {question.answer ? (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3">
          <span className="text-xs font-medium text-primary">Resposta do vendedor</span>
          <p className="text-sm text-muted-foreground">{question.answer}</p>
        </div>
      ) : isOwnProduct ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Responda essa pergunta…"
            rows={2}
            disabled={pending}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={submitAnswer}
            disabled={pending || !draft.trim()}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Responder
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Ainda sem resposta do vendedor.</p>
      )}
    </li>
  )
}
