import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { ArrowLeft } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ProductForm } from "@/components/seller/product-form"
import { Button } from "@/components/ui/button"
import { db } from "@/lib/db"
import { sellerApplication } from "@/lib/db/schema"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Novo anúncio",
}

export default async function NovoProdutoPage({
  searchParams,
}: {
  searchParams: Promise<{ jogo?: string }>
}) {
  const { jogo } = await searchParams
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const [application] = await db
    .select({ status: sellerApplication.status })
    .from(sellerApplication)
    .where(eq(sellerApplication.userId, session.user.id))
    .limit(1)

  if (!application || application.status !== "aprovado") redirect("/vender")

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
            <h1 className="text-2xl font-semibold tracking-tight">Novo anúncio</h1>
            <p className="text-sm text-muted-foreground">
              Descreva o produto e cadastre os itens que o comprador pode escolher.
            </p>
          </header>

          <ProductForm defaultGame={jogo} />
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
