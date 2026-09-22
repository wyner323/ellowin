"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, MessageCircleQuestion } from "lucide-react"
import { answerProductQuestion } from "@/app/actions/product-questions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { SellerQuestion } from "@/lib/marketplace"

/** Todas as perguntas recebidas pelo vendedor, de todos os anúncios, sem resposta primeiro. */
export function SellerQuestionsList({ questions }: { questions: SellerQuestion[] }) {
  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center">
        <MessageCircleQuestion className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">Nenhuma pergunta recebida ainda</p>
        <p className="text-sm text-muted-foreground">
          Perguntas feitas nos seus anúncios aparecem aqui pra você responder.
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {questions.map((q) => (
        <QuestionRow key={q.id} question={q} />
      ))}
    </ul>
  )
}

function QuestionRow({ question }: { question: SellerQuestion }) {
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
        <Link
          href={`/produtos/${question.productSlug}`}
          className="text-xs font-medium text-primary hover:underline"
        >
          {question.productTitle}
        </Link>
        <span className="text-xs text-muted-foreground">
          {question.createdAt.toLocaleDateString("pt-BR")}
        </span>
      </div>
      <p className="text-sm">
        <span className="font-medium">{question.askerName}: </span>
        {question.question}
      </p>

      {question.answer ? (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3">
          <span className="text-xs font-medium text-primary">Sua resposta</span>
          <p className="text-sm text-muted-foreground">{question.answer}</p>
        </div>
      ) : (
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
      )}
    </li>
  )
}
