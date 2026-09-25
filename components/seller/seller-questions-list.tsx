"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { CornerDownRight, ImageIcon, Loader2 } from "lucide-react"
import { answerProductQuestion } from "@/app/actions/product-questions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { SellerQuestion } from "@/lib/marketplace"
import { formatLastActive } from "@/lib/time"
import { cn, initialsOf } from "@/lib/utils"

const MAX_ANSWER = 1000

/** Perguntas recebidas pelo vendedor: as sem resposta se destacam e trazem o campo pra responder ali mesmo. */
export function SellerQuestionsList({ questions }: { questions: SellerQuestion[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {questions.map((q) => (
        <QuestionCard key={q.id} question={q} />
      ))}
    </ul>
  )
}

function QuestionCard({ question }: { question: SellerQuestion }) {
  const router = useRouter()
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const answered = Boolean(question.answer)

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
    <li
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5",
        answered ? "border-border" : "border-primary/40",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/produtos/${question.productSlug}`}
          className="group flex min-w-0 items-center gap-2.5"
        >
          <span className="relative size-9 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
            {question.productCoverUrl ? (
              <Image
                src={question.productCoverUrl}
                alt=""
                fill
                sizes="36px"
                className="object-cover"
              />
            ) : (
              <span className="flex size-full items-center justify-center text-muted-foreground">
                <ImageIcon className="size-4" aria-hidden="true" />
              </span>
            )}
          </span>
          <span className="truncate text-sm font-medium group-hover:text-primary">
            {question.productTitle}
          </span>
        </Link>
        {answered ? (
          <span className="shrink-0 text-xs text-muted-foreground">Respondida</span>
        ) : (
          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[0.7rem] font-medium text-primary">
            Aguardando resposta
          </span>
        )}
      </div>

      <div className="flex items-start gap-3">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
          aria-hidden="true"
        >
          {initialsOf(question.askerName)}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium">{question.askerName}</span>
            <span className="text-xs text-muted-foreground">
              {formatLastActive(question.createdAt)}
            </span>
          </div>
          <p className="text-sm leading-relaxed break-words">{question.question}</p>
        </div>
      </div>

      {answered ? (
        <div className="ml-4 flex items-start gap-2 rounded-xl bg-primary/5 p-3 sm:ml-11">
          <CornerDownRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium text-primary">
              Sua resposta
              {question.answeredAt ? ` · ${formatLastActive(question.answeredAt)}` : ""}
            </span>
            <p className="text-sm leading-relaxed break-words text-muted-foreground">
              {question.answer}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:ml-11">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Responda essa pergunta — a resposta aparece pública no anúncio."
            rows={3}
            maxLength={MAX_ANSWER}
            disabled={pending}
            aria-label={`Resposta para ${question.askerName}`}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              {draft.length}/{MAX_ANSWER}
            </span>
            <Button size="sm" onClick={submitAnswer} disabled={pending || !draft.trim()}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Responder
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
