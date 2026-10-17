import Link from "next/link"
import { CheckCircle2, ChevronDown } from "lucide-react"
import type { GameSeo } from "@/lib/game-seo"
import { AUTO_RELEASE_DAYS } from "@/lib/money"

/**
 * Texto de apoio no fim de `/jogos/[slug]`: como comprar, o que conferir e
 * perguntas frequentes. O passo a passo usa as constantes reais do sistema
 * (liberação automática), o resto vem de `lib/game-seo.ts`.
 */
export function GameSeoSection({ game, seo }: { game: string; seo: GameSeo }) {
  const steps = [
    "Escolha o anúncio e confirme a compra. O valor sai do seu saldo e fica retido pela Ellowin.",
    "O vendedor entrega dentro do prazo do anúncio e você acompanha pela página do pedido.",
    `Confira o que recebeu e confirme o recebimento. Sem confirmação nem disputa, o valor é liberado ao vendedor automaticamente ${AUTO_RELEASE_DAYS} dias após a entrega.`,
  ]

  return (
    <section
      aria-labelledby="sobre-jogo"
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pb-14"
    >
      <div className="flex flex-col gap-3">
        <h2 id="sobre-jogo" className="text-xl font-bold tracking-tight text-balance">
          Comprar {game} na Ellowin
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{seo.intro}</p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Como funciona a compra</h3>
        <ol className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span className="min-w-0 pt-0.5 text-pretty">{step}</span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">
          Mais detalhes na{" "}
          <Link
            href="/ajuda#como-protege"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            central de ajuda
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">O que conferir antes de comprar</h3>
        <ul className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
          {seo.tips.map((tip) => (
            <li key={tip} className="flex gap-2.5">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 text-pretty">{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Perguntas frequentes sobre {game}</h3>
        <div className="flex flex-col gap-2">
          {seo.faq.map((item) => (
            <details
              key={item.id}
              className="group rounded-xl border border-border bg-card open:border-primary/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3.5 text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                <span className="text-pretty">{item.question}</span>
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground text-pretty">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
