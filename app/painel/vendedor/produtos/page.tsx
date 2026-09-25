import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { PackageX, PauseCircle, Plus, Store } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { FilterPills } from "@/components/filter-pills"
import { Pagination } from "@/components/pagination"
import { ProductSearchForm, SellerProductsList } from "@/components/seller/seller-products-list"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { StatTiles } from "@/components/stat-tiles"
import { Button } from "@/components/ui/button"
import {
  getSellerListingSummary,
  getSellerProductsPage,
  getSellerUnansweredQuestionsCount,
} from "@/lib/marketplace"
import { parsePage } from "@/lib/pagination"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Meus anúncios",
}

const STATUSES = ["ativo", "pausado"] as const

export default async function MeusProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; pagina?: string }>
}) {
  const sp = await searchParams
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : ""
  const status = STATUSES.find((s) => s === sp.status)

  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const [list, summary, pendingQuestions] = await Promise.all([
    getSellerProductsPage(session.user.id, { q, status, page: parsePage(sp.pagina) }),
    getSellerListingSummary(session.user.id),
    getSellerUnansweredQuestionsCount(session.user.id),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <SellerTabs pendingQuestions={pendingQuestions} />

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-2xl font-bold tracking-tight">Meus anúncios</h1>
              <p className="text-sm text-muted-foreground">
                Cada anúncio pode ter vários itens com preço e estoque próprios.
              </p>
            </div>
            <Button render={<Link href="/painel/vendedor/produtos/novo" />} size="sm">
              <Plus className="size-4" />
              Novo anúncio
            </Button>
          </header>

          {!list.hasAny ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center">
              <div className="relative h-28 w-28">
                <Image
                  src="/images/mascote/ello-repouso.png"
                  alt=""
                  fill
                  sizes="112px"
                  className="object-contain"
                />
              </div>
              <div>
                <p className="font-medium">Nenhum anúncio publicado</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Publique o primeiro item para começar a vender.
                </p>
              </div>
              <Button render={<Link href="/painel/vendedor/produtos/novo" />} size="sm">
                Criar anúncio
              </Button>
            </div>
          ) : (
            <>
              <StatTiles
                tiles={[
                  { icon: Store, label: summary.active === 1 ? "anúncio ativo" : "anúncios ativos", value: String(summary.active) },
                  { icon: PauseCircle, label: summary.paused === 1 ? "anúncio pausado" : "anúncios pausados", value: String(summary.paused) },
                  {
                    icon: PackageX,
                    label: summary.outOfStock === 1 ? "ativo sem estoque" : "ativos sem estoque",
                    value: String(summary.outOfStock),
                    tone: summary.outOfStock > 0 ? "gold" : undefined,
                  },
                ]}
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <FilterPills
                  items={[
                    { value: "todos", label: "Todos", count: summary.total },
                    { value: "ativo", label: "Ativos", count: summary.active },
                    { value: "pausado", label: "Pausados", count: summary.paused },
                  ]}
                  active={status ?? "todos"}
                  basePath="/painel/vendedor/produtos"
                  params={{ q: q || undefined }}
                  label="Filtrar anúncios por status"
                />
                <ProductSearchForm query={q} status={status} />
              </div>

              <SellerProductsList products={list.products} query={q} />
              <Pagination
                page={list.page}
                pages={list.pages}
                total={list.total}
                basePath="/painel/vendedor/produtos"
                params={{ q: q || undefined, status }}
              />
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
