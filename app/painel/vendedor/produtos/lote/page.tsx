import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Search } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Pagination } from "@/components/pagination"
import { BulkEditTable } from "@/components/seller/bulk-edit-table"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getSellerUnansweredQuestionsCount } from "@/lib/marketplace"
import { parsePage } from "@/lib/pagination"
import { getBulkRowsPage, BULK_PAGE_SIZE } from "@/lib/seller-bulk"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Editar em lote",
}

export default async function EditarEmLotePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>
}) {
  const sp = await searchParams
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : ""

  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const [list, pendingQuestions] = await Promise.all([
    getBulkRowsPage(session.user.id, { q, page: parsePage(sp.pagina) }),
    getSellerUnansweredQuestionsCount(session.user.id),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <SellerTabs pendingQuestions={pendingQuestions} />

      <main id="conteudo" className="flex-1">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
          <div>
            <Button render={<Link href="/painel/vendedor/produtos" />} variant="ghost" size="sm" className="-ml-2">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Meus anúncios
            </Button>
          </div>

          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-2xl font-bold tracking-tight">Editar preço e estoque em lote</h1>
              <p className="text-sm text-muted-foreground">
                {list.total.toLocaleString("pt-BR")} {list.total === 1 ? "item ativo" : "itens ativos"} nos seus anúncios, até {BULK_PAGE_SIZE} por página.
              </p>
            </div>
            <form method="get" action="/painel/vendedor/produtos/lote" role="search" className="flex w-full gap-2 sm:max-w-sm">
              <Input name="q" defaultValue={q} placeholder="Buscar por nome do anúncio" className="h-9" maxLength={100} />
              <Button type="submit" variant="outline" size="sm" className="h-9">
                <Search className="size-4" aria-hidden="true" />
                Buscar
              </Button>
            </form>
          </header>

          {list.rows.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {q ? <>Nenhum item encontrado para &quot;{q}&quot;.</> : "Você ainda não tem itens ativos em anúncios."}
            </p>
          ) : (
            <>
              <BulkEditTable key={`${list.page}:${q}`} rows={list.rows} />
              <Pagination page={list.page} pages={list.pages} total={list.total} basePath="/painel/vendedor/produtos/lote" params={{ q: q || undefined }} />
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
