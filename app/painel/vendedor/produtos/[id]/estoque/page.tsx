import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, KeyRound, PackageCheck } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { StockManager } from "@/components/seller/stock-manager"
import { Button } from "@/components/ui/button"
import { getProductStock } from "@/lib/delivery-stock"
import { getProductForSeller, getSellerUnansweredQuestionsCount } from "@/lib/marketplace"
import { hasEncryptionKey } from "@/lib/secret-box"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Estoque do anúncio",
}

/** Estoque de itens (códigos, chaves, logins) de um anúncio de entrega automática. Só o dono vê. */
export default async function EstoqueProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const productId = Number(id)
  if (!Number.isInteger(productId)) notFound()

  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const [product, pendingQuestions] = await Promise.all([
    getProductForSeller(session.user.id, productId),
    getSellerUnansweredQuestionsCount(session.user.id),
  ])
  if (!product) notFound()

  const automatic = product.deliveryType === "automatica"
  const stock = automatic ? await getProductStock(session.user.id, productId) : null
  const keyReady = hasEncryptionKey()

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <SellerTabs pendingQuestions={pendingQuestions} />

      <main id="conteudo" className="flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
          <div>
            <Button render={<Link href="/painel/vendedor/produtos" />} variant="ghost" size="sm" className="-ml-2">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Meus anúncios
            </Button>
          </div>

          <header className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">Estoque de itens</h1>
            <p className="text-sm text-muted-foreground">{product.title}</p>
          </header>

          {!automatic ? (
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6">
              <p className="text-sm">
                Este anúncio é de <strong>entrega manual</strong>: você entrega os dados no chat de cada pedido. Para vender com entrega
                automática, mude o tipo de entrega do anúncio (disponível para gift cards e contas).
              </p>
              <Button render={<Link href={`/painel/vendedor/produtos/${product.id}`} />} variant="outline" size="sm">
                Editar anúncio
              </Button>
            </div>
          ) : stock === null ? (
            <p className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
              O estoque de itens ainda não está disponível: falta atualizar o banco de dados da plataforma. Seus anúncios continuam funcionando.
            </p>
          ) : (
            <>
              <section className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4" aria-label="Como funciona">
                <PackageCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Cada item do anúncio tem o seu estoque. Quando alguém compra, a plataforma entrega um item na hora e o pedido já fica
                  como entregue; o comprador tem o prazo de conferência normal antes de o pagamento ser liberado a você. O número de itens
                  disponíveis é o estoque que aparece para o comprador.
                </p>
              </section>

              {!keyReady ? (
                <p role="status" className="flex items-start gap-2 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
                  <KeyRound className="mt-0.5 size-4 shrink-0 text-gold-text" aria-hidden="true" />
                  O armazenamento seguro dos itens ainda não foi configurado na plataforma, então o cadastro está desligado por enquanto.
                </p>
              ) : null}

              {stock.length === 0 ? (
                <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
                  Este anúncio não tem itens ativos. Adicione um item na edição do anúncio para poder cadastrar o estoque.
                </p>
              ) : (
                <div className="flex flex-col gap-5">
                  {stock.map((variant) => (
                    <StockManager
                      key={variant.variantId}
                      variantId={variant.variantId}
                      label={variant.label}
                      available={variant.available}
                      sold={variant.sold}
                      items={variant.items}
                      disabled={!keyReady}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
