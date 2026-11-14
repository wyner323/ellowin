import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { CategoryDecision, StockReviewToggle } from "@/components/admin/category-decision"
import { getCategory } from "@/lib/catalog"
import { listApprovalQueue, type PendingApproval } from "@/lib/category-approval"
import { getStaff } from "@/lib/roles"

export const metadata: Metadata = { title: "Categorias dos vendedores" }

export const dynamic = "force-dynamic"

const STATUS_LABEL = { pendente: "Pendente", aprovado: "Aprovado", recusado: "Recusado" } as const

function Who({ row }: { row: PendingApproval }) {
  return (
    <p className="text-sm">
      <strong>{row.storeName ?? "Sem nome de loja"}</strong> <span className="text-muted-foreground">({row.sellerName}, nome legal)</span>
      <span className="text-muted-foreground"> · {row.completedSales} {row.completedSales === 1 ? "venda concluída" : "vendas concluídas"}</span>
    </p>
  )
}

/** Fila de pedidos de aprovação dos vendedores nas categorias restritas. Acesso da equipe (layout) e conferido de novo aqui. */
export default async function CategoriasAdminPage() {
  const staff = await getStaff()
  if (!staff) redirect("/")

  const { available, pending, decided } = await listApprovalQueue()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Categorias dos vendedores</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Pedidos para vender em categorias que exigem aprovação. A explicação do vendedor é uma declaração: a Ellowin não a confere, e você decide se libera. Recusar (ou revogar) pausa os anúncios do vendedor na categoria.
        </p>
      </header>

      {!available ? (
        <p role="status" className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
          A aprovação de categorias ainda não foi ativada (falta aplicar a atualização do banco de dados).
        </p>
      ) : (
        <>
          <section aria-labelledby="pendentes" className="flex flex-col gap-3">
            <h2 id="pendentes" className="text-sm font-semibold">
              Pendentes ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
                <ShieldCheck className="size-8 text-muted-foreground" aria-hidden="true" />
                <p className="font-medium">Nenhum pedido pendente</p>
              </div>
            ) : (
              pending.map((row) => (
                <article key={row.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                  <header className="flex flex-col gap-1">
                    <h3 className="font-display text-base font-bold">{getCategory(row.categorySlug)?.name ?? row.categorySlug}</h3>
                    <Who row={row} />
                  </header>
                  <p className="whitespace-pre-wrap rounded-xl bg-muted p-3 text-sm">{row.statement}</p>
                  <CategoryDecision approvalId={row.id} stockReviewDefault={row.stockReview} />
                </article>
              ))
            )}
          </section>

          <section aria-labelledby="decididos" className="flex flex-col gap-3">
            <h2 id="decididos" className="text-sm font-semibold">
              Decididos
            </h2>
            {decided.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada decidido ainda.</p>
            ) : (
              decided.map((row) => (
                <article key={row.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
                  <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">{getCategory(row.categorySlug)?.name ?? row.categorySlug}</h3>
                    <span className="text-xs text-muted-foreground">{STATUS_LABEL[row.status]}</span>
                  </header>
                  <Who row={row} />
                  {row.decisionNote ? <p className="text-xs text-muted-foreground">Observação: {row.decisionNote}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {row.status === "aprovado" ? <StockReviewToggle approvalId={row.id} stockReview={row.stockReview} /> : null}
                    {row.status === "aprovado" ? <CategoryDecision approvalId={row.id} stockReviewDefault={row.stockReview} /> : null}
                  </div>
                </article>
              ))
            )}
          </section>
        </>
      )}
    </div>
  )
}
