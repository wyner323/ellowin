import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { CheckCircle2, MessageSquareText } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { FilterPills } from "@/components/filter-pills"
import { StarRating } from "@/components/marketplace/star-rating"
import { ReviewReplyView } from "@/components/marketplace/review-reply-view"
import { Pagination } from "@/components/pagination"
import { ReviewReplyForm } from "@/components/seller/review-reply-form"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { getSellerUnansweredQuestionsCount } from "@/lib/marketplace"
import { parsePage } from "@/lib/pagination"
import { getSellerReviewsPage, parseReviewFilter } from "@/lib/review-replies"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Avaliações recebidas",
}

export default async function AvaliacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; pagina?: string }>
}) {
  const sp = await searchParams
  const filter = parseReviewFilter(sp.filtro)

  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const [list, pendingQuestions] = await Promise.all([
    getSellerReviewsPage(session.user.id, { filter, page: parsePage(sp.pagina) }),
    getSellerUnansweredQuestionsCount(session.user.id),
  ])
  const { counts } = list

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <SellerTabs pendingQuestions={pendingQuestions} />

      <main id="conteudo" className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
          <header className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">Avaliações recebidas</h1>
            <p className="text-sm text-muted-foreground">
              Responder mostra a quem vai comprar que existe alguém do outro lado. A resposta fica pública, logo abaixo da avaliação, no anúncio e na sua loja.
            </p>
          </header>

          {counts.all === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
              <MessageSquareText className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">Nenhuma avaliação recebida ainda</p>
              <p className="text-sm text-muted-foreground">As avaliações aparecem aqui depois que um comprador confirma o recebimento e avalia.</p>
            </div>
          ) : (
            <>
              {!list.repliesAvailable ? (
                <p role="status" className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
                  As respostas às avaliações ainda não estão disponíveis: falta atualizar o banco de dados da plataforma. Você já pode ler as avaliações.
                </p>
              ) : counts.unanswered === 0 ? (
                <p className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/5 p-4 text-sm font-medium text-success">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Tudo respondido: nenhuma avaliação sem resposta.
                </p>
              ) : null}

              {list.repliesAvailable ? (
                <FilterPills
                  items={[
                    { value: "todas", label: "Todas", count: counts.all },
                    { value: "sem-resposta", label: "Sem resposta", count: counts.unanswered },
                  ]}
                  active={filter}
                  basePath="/painel/vendedor/avaliacoes"
                  param="filtro"
                  label="Filtrar avaliações"
                />
              ) : null}

              {list.rows.length === 0 ? (
                <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Nenhuma avaliação nesse filtro.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {list.rows.map((r) => (
                    <li key={r.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-col">
                          <span className="text-sm font-medium">{r.buyerName}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {r.productTitle} · pedido #{r.orderId}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <StarRating rating={r.rating} />
                          <span className="text-xs text-muted-foreground">{r.createdAt.toLocaleDateString("pt-BR")}</span>
                        </div>
                      </div>
                      {r.comment ? (
                        <p className="text-sm leading-relaxed break-words text-muted-foreground">{r.comment}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Avaliação só com nota, sem comentário.</p>
                      )}
                      <ReviewReplyView reply={r.reply} />
                      {list.repliesAvailable ? <ReviewReplyForm reviewId={r.id} initial={r.reply?.body ?? ""} /> : null}
                    </li>
                  ))}
                </ul>
              )}

              <Pagination page={list.page} pages={list.pages} total={list.filtered} basePath="/painel/vendedor/avaliacoes" params={{ filtro: filter === "todas" ? undefined : filter }} />
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
