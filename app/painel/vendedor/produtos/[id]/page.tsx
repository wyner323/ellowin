import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ProductForm } from "@/components/seller/product-form"
import { Button } from "@/components/ui/button"
import { getProductForSeller } from "@/lib/marketplace"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Editar anúncio",
}

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const productId = Number(id)
  if (!Number.isInteger(productId)) notFound()

  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const product = await getProductForSeller(session.user.id, productId)
  if (!product) notFound()

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
          <div>
            <Button
              render={<Link href="/painel/vendedor/produtos" />}
              variant="ghost"
              size="sm"
              className="-ml-2"
            >
              <ArrowLeft className="size-4" />
              Meus anúncios
            </Button>
          </div>

          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Editar anúncio</h1>
            <p className="text-sm text-muted-foreground">
              Itens removidos são desativados — pedidos antigos continuam válidos.
            </p>
          </header>

          <ProductForm product={product} />
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
