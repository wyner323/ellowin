import type { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"
import { CalendarDays } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ProductCard } from "@/components/marketplace/product-card"
import { StarRating } from "@/components/marketplace/star-rating"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { BADGE_META } from "@/lib/badges"
import { accentColorHex } from "@/lib/accent-colors"
import { getSellerStorefront } from "@/lib/marketplace"
import { initialsOf } from "@/lib/utils"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const store = await getSellerStorefront(slug)
  if (!store) return { title: "Loja não encontrada — Ellowin" }

  return {
    title: `${store.name} — Ellowin`,
    description: store.bio ?? `Anúncios de ${store.name} na Ellowin.`,
  }
}

export default async function LojaPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const store = await getSellerStorefront(slug)
  if (!store) notFound()

  const accent = accentColorHex(store.accentColor)
  const memberSince = store.memberSince.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  })

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-accent to-muted sm:h-56">
          {store.bannerUrl ? (
            <Image
              src={store.bannerUrl}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
          ) : null}
          {accent ? (
            <div
              className="absolute inset-0 mix-blend-multiply"
              style={{ background: `linear-gradient(135deg, ${accent}55, transparent)` }}
              aria-hidden="true"
            />
          ) : null}
        </div>

        <div className="mx-auto w-full max-w-6xl px-4">
          <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <Avatar
                className="size-24 shrink-0 border-4 border-background sm:size-28"
                style={accent ? { boxShadow: `0 0 0 3px ${accent}` } : undefined}
              >
                {store.image ? <AvatarImage src={store.image} alt="" /> : null}
                <AvatarFallback className="text-2xl font-semibold">
                  {initialsOf(store.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1 pb-1">
                <h1 className="text-2xl font-bold tracking-tight text-balance">{store.name}</h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <StarRating rating={store.stats.rating} count={store.stats.ratingCount} />
                  <span>Nível {store.level}</span>
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                    Desde {memberSince}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {store.bio ? (
            <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {store.bio}
            </p>
          ) : null}

          {store.badges.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {store.badges.map((id) => {
                const meta = BADGE_META[id]
                return (
                  <li
                    key={id}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium"
                    style={accent ? { borderColor: accent, color: accent } : undefined}
                  >
                    <meta.icon className="size-3.5" aria-hidden="true" />
                    {meta.label}
                  </li>
                )
              })}
            </ul>
          ) : null}

          <section className="mt-10 pb-14">
            <h2 className="text-lg font-semibold">Anúncios ativos</h2>

            {store.products.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Esta loja não tem anúncios ativos no momento.
              </p>
            ) : (
              <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {store.products.map((card) => (
                  <ProductCard key={card.key} card={card} />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
