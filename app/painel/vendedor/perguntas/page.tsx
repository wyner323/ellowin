import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { SellerQuestionsList } from "@/components/seller/seller-questions-list"
import { getSellerQuestions, getSellerUnansweredQuestionsCount } from "@/lib/marketplace"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Perguntas recebidas",
}

export default async function PerguntasPage() {
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const [questions, pendingQuestions] = await Promise.all([
    getSellerQuestions(session.user.id),
    getSellerUnansweredQuestionsCount(session.user.id),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <SellerTabs pendingQuestions={pendingQuestions} />

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Perguntas recebidas</h1>
            <p className="text-sm text-muted-foreground">
              {pendingQuestions > 0
                ? `${pendingQuestions} ${pendingQuestions === 1 ? "pergunta espera" : "perguntas esperam"} resposta.`
                : "Tudo respondido — nenhuma pergunta pendente."}
            </p>
          </header>

          <SellerQuestionsList questions={questions} />
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
