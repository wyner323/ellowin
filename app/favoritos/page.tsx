import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { Heart, ImageIcon } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { RemoveFavoriteButton } from "@/components/product/remove-favorite-button"
import { Button } from "@/components/ui/button"
import { getFavorites, MAX_FAVORITES } from "@/lib/favorites"
import { formatCents } from "@/lib/money"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Favoritos",
  robots: { index: false, follow: false },
}

/** Anúncios que a pessoa guardou. Privado: cada um vê só os seus. */
export default async function FavoritosPage() {
  const session = await getSession()
  if (!session?.user) redirect("/entrar?next=/favoritos")

  const { available, items } = await getFavorites(session.user.id)

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main id="conteudo" className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
          <header className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">Favoritos</h1>
            <p className="max-w-prose text-sm text-muted-foreground">
              Anúncios que você guardou. Se o menor preço de um deles baixar, avisamos por e-mail (no máximo um aviso por anúncio por dia). Só você vê esta lista; o vendedor não sabe quem guardou.
            </p>
          </header>

          {!available ? (
            <p role="status" className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
              Os favoritos ainda não estão disponíveis: falta atualizar o banco de dados da plataforma.
            </p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
              <Heart className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">Você ainda não guardou nenhum anúncio</p>
              <p className="text-sm text-muted-foreground">Use &quot;Guardar nos favoritos&quot; na página de um anúncio para acompanhar o preço dele.</p>
              <Button render={<Link href="/jogos" />} size="sm">
                Ver jogos
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground tabular-nums">
                {items.length} de {MAX_FAVORITES} anúncios guardados
              </p>
              <ul className="flex flex-col gap-3">
                {items.map((item) => (
                  <li key={item.productId} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3">
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {item.coverUrl ? (
                        <Image src={item.coverUrl} alt="" fill sizes="80px" className="object-cover" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="size-6" aria-hidden="true" />
                        </span>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <Link href={`/produtos/${item.slug}`} className="line-clamp-2 leading-snug font-medium hover:text-primary">
                        {item.title}
                      </Link>
                      <span className="truncate text-xs text-muted-foreground">{[item.game, item.seller].filter(Boolean).join(" · ")}</span>
                      {item.forSale && item.priceCents !== null ? (
                        <span className="text-sm">
                          <span className="text-xs text-muted-foreground">a partir de </span>
                          <strong className="font-display tabular-nums">{formatCents(item.priceCents)}</strong>
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Indisponível no momento</span>
                      )}
                    </div>

                    <RemoveFavoriteButton productId={item.productId} title={item.title} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
