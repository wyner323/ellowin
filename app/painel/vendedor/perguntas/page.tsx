import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { CheckCircle2, MessageCircleQuestion } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { FilterPills } from "@/components/filter-pills"
import { Pagination } from "@/components/pagination"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { SellerQuestionsList } from "@/components/seller/seller-questions-list"
import { getSellerQuestionsPage } from "@/lib/marketplace"
import { parsePage } from "@/lib/pagination"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Perguntas recebidas",
}

const FILTERS = ["pendentes", "respondidas"] as const

export default async function PerguntasPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; pagina?: string }>
}) {
  const sp = await searchParams
  const filter = FILTERS.find((f) => f === sp.filtro)

  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const list = await getSellerQuestionsPage(session.user.id, {
    filter,
    page: parsePage(sp.pagina),
  })
  const { counts } = list

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <SellerTabs pendingQuestions={counts.pending} />

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
          <header className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">Perguntas recebidas</h1>
            <p className="text-sm text-muted-foreground">
              Quem responde rápido vende mais: a pergunta e a resposta ficam públicas no anúncio e
              tiram a dúvida de quem ainda vai comprar.
            </p>
          </header>

          {counts.total === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
              <MessageCircleQuestion className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">Nenhuma pergunta recebida ainda</p>
              <p className="text-sm text-muted-foreground">
                Perguntas feitas nos seus anúncios aparecem aqui pra você responder.
              </p>
            </div>
          ) : (
            <>
              {counts.pending === 0 ? (
                <p className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/5 p-4 text-sm font-medium text-success">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Tudo respondido — nenhuma pergunta pendente.
                </p>
              ) : null}

              <FilterPills
                items={[
                  { value: "todos", label: "Todas", count: counts.total },
                  { value: "pendentes", label: "Pendentes", count: counts.pending },
                  { value: "respondidas", label: "Respondidas", count: counts.answered },
                ]}
                active={filter ?? "todos"}
                basePath="/painel/vendedor/perguntas"
                param="filtro"
                label="Filtrar perguntas"
              />

              {list.questions.length === 0 ? (
                <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                  Nenhuma pergunta nesse filtro.
                </p>
              ) : (
                <SellerQuestionsList questions={list.questions} />
              )}

              <Pagination
                page={list.page}
                pages={list.pages}
                total={list.filtered}
                basePath="/painel/vendedor/perguntas"
                params={{ filtro: filter }}
              />
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
