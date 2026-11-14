import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { PackageCheck } from "lucide-react"
import { StockDecision } from "@/components/admin/stock-decision"
import { getCategory } from "@/lib/catalog"
import { getStaff } from "@/lib/roles"
import { listStockBatches, type BatchQueueRow } from "@/lib/stock-review"

export const metadata: Metadata = { title: "Estoque para análise" }

export const dynamic = "force-dynamic"

const STATUS_LABEL = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  recusado: "Recusado",
  quarentena: "Em quarentena",
} as const

function Batch({ row }: { row: BatchQueueRow }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-bold">
          {row.itemCount} {row.itemCount === 1 ? "item" : "itens"}: {row.variantLabel}
        </h3>
        <span className="text-xs text-muted-foreground">{STATUS_LABEL[row.status]}</span>
      </header>
      <p className="text-sm">
        {row.productTitle} <span className="text-muted-foreground">({getCategory(row.categorySlug)?.name ?? row.categorySlug})</span>
      </p>
      <p className="text-sm">
        <strong>{row.storeName ?? "Sem nome de loja"}</strong> <span className="text-muted-foreground">({row.sellerName}, nome legal)</span>
        <span className="text-muted-foreground"> · {row.completedSales} {row.completedSales === 1 ? "venda concluída" : "vendas concluídas"}</span>
      </p>
      {row.statement ? <p className="whitespace-pre-wrap rounded-xl bg-muted p-3 text-sm">Origem declarada neste envio: {row.statement}</p> : <p className="text-xs text-muted-foreground">Sem origem declarada neste envio.</p>}
      {row.masks.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Amostra ({row.masks.length} de {row.unsold}): <code>{row.masks.join("  ·  ")}</code>
        </p>
      ) : null}
      {row.reviewNote ? <p className="text-xs text-muted-foreground">Observação registrada: {row.reviewNote}</p> : null}
      <StockDecision batchId={row.id} status={row.status} />
    </article>
  )
}

/** Fila de lotes de estoque dos vendedores de entrega automática. Só a máscara dos itens aparece, nunca o conteúdo. */
export default async function EstoqueAdminPage() {
  const staff = await getStaff()
  if (!staff) redirect("/")

  const { available, pending, others } = await listStockBatches()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Estoque para análise</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Envios de itens (códigos, chaves, logins) de vendedores que ainda têm a análise ligada. Você não vê o conteúdo, só a máscara; a Ellowin não consegue conferir um código com a emissora. Aprovar põe os itens à venda; recusar apaga os não vendidos;
          retirar da venda interrompe o resto do lote sem apagar.
        </p>
      </header>

      {!available ? (
        <p role="status" className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
          A análise de estoque ainda não foi ativada (falta aplicar a atualização do banco de dados).
        </p>
      ) : (
        <>
          <section aria-labelledby="pendentes" className="flex flex-col gap-3">
            <h2 id="pendentes" className="text-sm font-semibold">
              Pendentes ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
                <PackageCheck className="size-8 text-muted-foreground" aria-hidden="true" />
                <p className="font-medium">Nenhum lote pendente</p>
              </div>
            ) : (
              pending.map((row) => <Batch key={row.id} row={row} />)
            )}
          </section>

          <section aria-labelledby="outros" className="flex flex-col gap-3">
            <h2 id="outros" className="text-sm font-semibold">
              Recentes
            </h2>
            {others.length === 0 ? <p className="text-sm text-muted-foreground">Nada por aqui ainda.</p> : others.map((row) => <Batch key={row.id} row={row} />)}
          </section>
        </>
      )}
    </div>
  )
}
