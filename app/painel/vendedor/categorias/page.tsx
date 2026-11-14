import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { CheckCircle2, Clock, XCircle } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { CategoryRequestForm } from "@/components/seller/category-request-form"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { categories } from "@/lib/catalog"
import { getSellerApprovals } from "@/lib/category-approval"
import { categoryRule } from "@/lib/category-rules"
import { getSellerUnansweredQuestionsCount } from "@/lib/marketplace"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Categorias do vendedor",
}

export const dynamic = "force-dynamic"

/**
 * Categorias que exigem aprovação da moderação (gift cards, recargas, assinaturas, keys, redes sociais): o vendedor vê o estado de
 * cada uma, as regras que aceita ao vender e pede aprovação com uma explicação de onde vem o que vai vender.
 */
export default async function CategoriasVendedorPage() {
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const [approvals, pendingQuestions] = await Promise.all([getSellerApprovals(session.user.id), getSellerUnansweredQuestionsCount(session.user.id)])
  const byCategory = new Map(approvals.rows.map((row) => [row.categorySlug, row]))
  const restricted = categories.filter((c) => categoryRule(c.slug).restricted)

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <SellerTabs pendingQuestions={pendingQuestions} />

      <main id="conteudo" className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
          <header className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">Categorias que precisam de aprovação</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Em algumas categorias a moderação da Ellowin libera cada vendedor antes do primeiro anúncio e analisa o estoque que você cadastra para entrega automática. É uma análise de quem vende e de onde vem o
              estoque, não uma garantia sobre cada item entregue.
            </p>
          </header>

          {!approvals.available ? (
            <p role="status" className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
              A aprovação de categorias ainda não foi ativada na plataforma (falta aplicar a atualização do banco de dados). Enquanto isso, só as categorias livres aceitam anúncio novo.
            </p>
          ) : null}

          <div className="grid gap-5">
            {restricted.map((category) => {
              const rule = categoryRule(category.slug)
              const row = byCategory.get(category.slug)
              return (
                <section key={category.slug} aria-labelledby={`cat-${category.slug}`} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <h2 id={`cat-${category.slug}`} className="font-display text-lg font-bold tracking-tight">
                        {category.name}
                      </h2>
                      <p className="text-sm text-muted-foreground">{category.tagline}</p>
                    </div>
                    {row?.status === "aprovado" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        Aprovado
                      </span>
                    ) : row?.status === "pendente" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-xs font-medium text-gold-text">
                        <Clock className="size-3.5" aria-hidden="true" />
                        Em análise
                      </span>
                    ) : row?.status === "recusado" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                        <XCircle className="size-3.5" aria-hidden="true" />
                        Não aprovado
                      </span>
                    ) : null}
                  </header>

                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-sm font-medium">Regras desta categoria</h3>
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
                      {rule.sellerRules.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>
                  </div>

                  {row?.status === "aprovado" ? (
                    <p className="text-sm text-muted-foreground">
                      {rule.stockReview
                        ? row.stockReview
                          ? "Os itens que você cadastrar para entrega automática passam pela análise da moderação antes de entrar à venda."
                          : "Os itens que você cadastrar para entrega automática entram à venda sem análise prévia, e a moderação acompanha as disputas."
                        : "Você já pode publicar anúncios nesta categoria."}
                    </p>
                  ) : row?.status === "pendente" ? (
                    <div className="flex flex-col gap-3">
                      <p className="text-sm text-muted-foreground">A moderação está analisando o seu pedido. Você recebe a resposta aqui e por e-mail.</p>
                      {approvals.available ? <CategoryRequestForm categorySlug={category.slug} prompt="Sua explicação (você pode ajustar enquanto espera)" initial={row.statement} buttonLabel="Atualizar o pedido" /> : null}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {row?.status === "recusado" ? (
                        <p role="status" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                          O pedido anterior não foi aprovado{row.decisionNote ? `: ${row.decisionNote}` : "."} Você pode ajustar a explicação e pedir de novo.
                        </p>
                      ) : null}
                      {approvals.available ? (
                        <CategoryRequestForm categorySlug={category.slug} prompt={rule.approvalPrompt} initial={row?.statement ?? ""} buttonLabel="Pedir aprovação" />
                      ) : null}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
