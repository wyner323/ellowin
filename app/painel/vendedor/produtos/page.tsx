import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { ArrowLeft, Plus } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { SellerProductsList } from "@/components/seller/seller-products-list"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { Button } from "@/components/ui/button"
import { getSellerProducts, getSellerUnansweredQuestionsCount } from "@/lib/marketplace"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Meus anúncios",
}

export default async function MeusProdutosPage() {
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const [products, pendingQuestions] = await Promise.all([
    getSellerProducts(session.user.id),
    getSellerUnansweredQuestionsCount(session.user.id),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <SellerTabs pendingQuestions={pendingQuestions} />

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
          <div>
            <Button
              render={<Link href="/painel/vendedor" />}
              variant="ghost"
              size="sm"
              className="-ml-2"
            >
              <ArrowLeft className="size-4" />
              Painel do vendedor
            </Button>
          </div>

          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-tight">Meus anúncios</h1>
              <p className="text-sm text-muted-foreground">
                Cada anúncio pode ter vários itens com preço e estoque próprios.
              </p>
            </div>
            <Button render={<Link href="/painel/vendedor/produtos/novo" />} size="sm">
              <Plus className="size-4" />
              Novo anúncio
            </Button>
          </header>

          {products.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-10 text-center">
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
            <SellerProductsList products={products} />
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
