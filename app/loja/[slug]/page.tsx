import type { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"
import { CalendarDays, Clock, Gauge, MessageSquareText, Meh, Timer, ThumbsDown, ThumbsUp } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ProductCard } from "@/components/marketplace/product-card"
import { StarRating } from "@/components/marketplace/star-rating"
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BADGE_META } from "@/lib/badges"
import { accentColorHex } from "@/lib/accent-colors"
import { getSellerStorefront } from "@/lib/marketplace"
import { formatDurationHours, formatLastActive, isOnline } from "@/lib/time"
import { cn, initialsOf } from "@/lib/utils"

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
  const online = isOnline(store.lastActiveAt)
  const totalReviews = store.reputation.positivas + store.reputation.neutras + store.reputation.negativas

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
          {/* Escurece a base do banner pra garantir contraste do nome/selo por
              cima, não importa o conteúdo da imagem de capa. */}
          <div
            className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent"
            aria-hidden="true"
          />
        </div>

        <div className="mx-auto w-full max-w-6xl px-4">
          <div className="relative -mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <Avatar
                size="lg"
                className="size-24 shrink-0 border-4 border-background sm:size-28"
                style={accent ? { boxShadow: `0 0 0 3px ${accent}` } : undefined}
              >
                {store.image ? <AvatarImage src={store.image} alt="" /> : null}
                <AvatarFallback className="text-2xl font-semibold">
                  {initialsOf(store.name)}
                </AvatarFallback>
                <AvatarBadge
                  className={cn("size-4 ring-4", online ? "bg-success" : "bg-muted-foreground/50")}
                  aria-label={online ? "Online agora" : "Offline"}
                />
              </Avatar>
              <div className="flex flex-col gap-1 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-balance">{store.name}</h1>
                  {online ? (
                    <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                      <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                      Online
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <StarRating rating={store.stats.rating} count={store.stats.ratingCount} />
                  <span>Nível {store.level}</span>
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

          <div className="mt-8 grid gap-6 lg:grid-cols-[280px_1fr]">
            <aside>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Detalhes</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                    Desde {memberSince}
                  </p>
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="size-4 shrink-0" aria-hidden="true" />
                    {online ? "Online agora" : formatLastActive(store.lastActiveAt)}
                  </p>
                </CardContent>
              </Card>
            </aside>

            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Reputação do vendedor</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 divide-x divide-border text-center">
                    <div className="flex flex-col items-center gap-1 px-2">
                      <ThumbsUp className="size-4 text-success" aria-hidden="true" />
                      <span className="text-xl font-semibold">{store.reputation.positivas}</span>
                      <span className="text-xs text-muted-foreground">Positivas</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 px-2">
                      <Meh className="size-4 text-muted-foreground" aria-hidden="true" />
                      <span className="text-xl font-semibold">{store.reputation.neutras}</span>
                      <span className="text-xs text-muted-foreground">Neutras</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 px-2">
                      <ThumbsDown className="size-4 text-destructive" aria-hidden="true" />
                      <span className="text-xl font-semibold">{store.reputation.negativas}</span>
                      <span className="text-xs text-muted-foreground">Negativas</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Velocidade de entrega</CardTitle>
                </CardHeader>
                <CardContent>
                  {store.delivery.total === 0 ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Timer className="size-4 shrink-0" aria-hidden="true" />
                      Ainda não há entregas suficientes para calcular esse indicador.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 divide-x divide-border text-center">
                      <div className="flex flex-col items-center gap-1 px-2">
                        <Gauge className="size-4 text-success" aria-hidden="true" />
                        <span className="text-xl font-semibold">{store.delivery.onTimePercent}%</span>
                        <span className="text-xs text-muted-foreground">Entregue no prazo</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 px-2">
                        <Timer className="size-4 text-muted-foreground" aria-hidden="true" />
                        <span className="text-xl font-semibold">
                          {formatDurationHours(store.delivery.avgDeliveryHours!)}
                        </span>
                        <span className="text-xs text-muted-foreground">Tempo médio de entrega</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Últimas avaliações recebidas</CardTitle>
                </CardHeader>
                <CardContent>
                  {totalReviews === 0 || store.recentReviews.length === 0 ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MessageSquareText className="size-4 shrink-0" aria-hidden="true" />
                      Este vendedor ainda não recebeu avaliações.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-4">
                      {store.recentReviews.map((r) => (
                        <li key={r.id} className="flex flex-col gap-1 border-b border-border pb-4 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{r.buyerName}</span>
                            <StarRating rating={r.rating} size="sm" />
                          </div>
                          {r.comment ? (
                            <p className="text-sm text-muted-foreground">{r.comment}</p>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {r.createdAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

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
