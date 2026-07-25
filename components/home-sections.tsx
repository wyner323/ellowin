import Image from 'next/image'
import Link from 'next/link'
import {
  BadgeCheck,
  Fingerprint,
  Headphones,
  Lock,
  Star,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { categories, formatBRL, games, listings } from '@/lib/catalog'

export function Hero() {
  return (
    <section className="border-b border-border bg-gradient-to-b from-accent/60 to-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-14 lg:flex-row lg:items-center lg:py-20">
        <div className="flex flex-1 flex-col items-start gap-6">
          <Badge variant="secondary" className="gap-1.5">
            <Fingerprint className="size-3.5" aria-hidden="true" />
            Cadastro verificado por CPF e email
          </Badge>
          <h1 className="text-4xl leading-tight font-bold text-balance sm:text-5xl">
            O marketplace de produtos digitais onde o dinheiro só sai depois da
            entrega
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground text-pretty">
            Contas de jogos, moedas, gift cards e boosting de vendedores
            verificados. A Ellowin retém o pagamento até você confirmar que
            recebeu o que comprou.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button render={<Link href="/cadastro" />} size="lg">
              Criar minha conta
            </Button>
            <Button render={<Link href="/vender" />} size="lg" variant="outline">
              Quero vender
            </Button>
          </div>
          <dl className="flex flex-wrap gap-x-8 gap-y-3 pt-2">
            {[
              { value: '29.5k', label: 'anúncios ativos' },
              { value: '4.9/5', label: 'avaliação média' },
              { value: '11 min', label: 'entrega média' },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col">
                <dt className="font-display text-2xl font-bold text-primary">
                  {stat.value}
                </dt>
                <dd className="text-xs text-muted-foreground">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-1 flex-col gap-3">
          {listings.slice(0, 3).map((listing) => (
            <Card key={listing.id} className="border-border/70">
              <CardContent className="flex items-center gap-4 p-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent font-display text-sm font-bold text-accent-foreground">
                  {listing.game.slice(0, 2).toUpperCase()}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-sm font-medium">{listing.title}</p>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BadgeCheck
                      className="size-3.5 text-primary"
                      aria-hidden="true"
                    />
                    {listing.seller.name} · Nível {listing.seller.level}
                  </span>
                </div>
                <span className="shrink-0 font-display text-sm font-bold">
                  {formatBRL(listing.price)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

export function CategoryGrid() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14" id="catalogos">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold sm:text-3xl">Catálogos da Ellowin</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Quatro verticais, todas com pagamento intermediado e vendedores com
          nível de verificação visível.
        </p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/catalogo/${category.slug}`}
            className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-accent">
              <Image
                src={category.image || '/placeholder.svg'}
                alt={`Ilustração do catálogo de ${category.name}`}
                fill
                sizes="(max-width: 640px) 100vw, 25vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h3 className="text-base font-semibold">{category.name}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {category.tagline}
              </p>
              <div className="mt-auto flex items-center justify-between pt-3">
                <span className="text-xs text-muted-foreground">
                  {category.listings.toLocaleString('pt-BR')} anúncios
                </span>
                <span className="text-xs font-semibold text-primary">
                  a partir de {formatBRL(category.startingAt)}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function GameStrip() {
  return (
    <section className="border-y border-border bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-6">
        <span className="mr-2 text-sm font-semibold">Jogos em alta</span>
        {games.map((game) => (
          <Link
            key={game}
            href="/catalogo/contas"
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {game}
          </Link>
        ))}
      </div>
    </section>
  )
}

export function FeaturedListings() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold sm:text-3xl">Anúncios em destaque</h2>
          <p className="text-sm text-muted-foreground">
            Selecionados entre vendedores de nível 3 ou superior.
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <TrendingUp className="size-4 text-primary" aria-hidden="true" />
          Atualizado agora
        </span>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {listings.slice(0, 8).map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </section>
  )
}

export function ListingCard({
  listing,
}: {
  listing: (typeof listings)[number]
}) {
  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-xs">
          {listing.game}
        </Badge>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star
            className="size-3.5 fill-chart-4 text-chart-4"
            aria-hidden="true"
          />
          {listing.seller.rating.toFixed(1)}
        </span>
      </div>

      <h3 className="mt-3 text-sm leading-snug font-medium text-pretty">
        {listing.title}
      </h3>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <BadgeCheck className="size-3.5 text-primary" aria-hidden="true" />
        {listing.seller.name} · Nível {listing.seller.level} ·{' '}
        {listing.seller.sales.toLocaleString('pt-BR')} vendas
      </p>

      <div className="mt-4 flex items-end justify-between gap-2 border-t border-border pt-3">
        <div className="flex flex-col">
          {listing.originalPrice ? (
            <span className="text-xs text-muted-foreground line-through">
              {formatBRL(listing.originalPrice)}
            </span>
          ) : null}
          <span className="font-display text-lg font-bold">
            {formatBRL(listing.price)}
          </span>
        </div>
        <span className="pb-1 text-xs text-muted-foreground">
          {listing.delivery}
        </span>
      </div>
    </article>
  )
}

const steps = [
  {
    icon: Lock,
    title: 'Você paga com segurança',
    description:
      'O valor fica retido na Ellowin. O vendedor é avisado do pedido, mas não recebe nada ainda.',
  },
  {
    icon: Headphones,
    title: 'O vendedor entrega',
    description:
      'A entrega acontece pelo chat do pedido, com prazo definido no anúncio e suporte acompanhando.',
  },
  {
    icon: Wallet,
    title: 'Você confirma e ele recebe',
    description:
      'Só depois da sua confirmação o valor cai na carteira do vendedor. Se algo der errado, abre-se disputa.',
  },
]

export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className="border-y border-border bg-muted/40 py-14"
    >
      <div className="mx-auto w-full max-w-6xl px-4">
        <h2 className="text-2xl font-bold sm:text-3xl">Como funciona</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <step.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="text-base font-semibold">
                {index + 1}. {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function TrustSection() {
  return (
    <section id="seguranca" className="mx-auto w-full max-w-6xl px-4 py-14">
      <div className="flex flex-col gap-8 rounded-2xl border border-border bg-card p-8 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-col gap-4">
          <h2 className="text-2xl font-bold text-balance">
            Cada vendedor passa por níveis de verificação
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            O nível aparece em todo anúncio. Quanto maior o nível, maior o limite
            de venda e menor a taxa — e nada é liberado sem CPF válido e email
            confirmado.
          </p>
          <Button
            render={<Link href="/vender/cadastro" />}
            className="self-start"
          >
            Começar meu cadastro de vendedor
          </Button>
        </div>

        <ul className="flex flex-1 flex-col gap-3">
          {[
            { level: 1, label: 'Email confirmado', limit: 'até R$ 500/mês' },
            { level: 2, label: 'Telefone confirmado', limit: 'até R$ 2.500/mês' },
            { level: 3, label: 'CPF e documento validados', limit: 'até R$ 15.000/mês' },
            { level: 4, label: 'Dados de saque confirmados', limit: 'sem limite mensal' },
          ].map((item) => (
            <li
              key={item.level}
              className="flex items-center gap-3 rounded-lg border border-border bg-background p-3"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                N{item.level}
              </span>
              <span className="flex-1 text-sm font-medium">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.limit}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
