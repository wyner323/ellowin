import Link from "next/link"
import { Lock, Scale, Undo2, type LucideIcon } from "lucide-react"

// Cada ponto aponta para uma resposta da central de ajuda (ids em lib/help-content.ts).
// Sem prazo em dias nem nome de programa: so o que o sistema faz hoje.
const POINTS: { icon: LucideIcon; title: string; text: string; href: string }[] = [
  {
    icon: Lock,
    title: "Pagamento retido",
    text: "O vendedor só recebe depois que você confirma o recebimento.",
    href: "/ajuda#como-protege",
  },
  {
    icon: Undo2,
    title: "Reembolso se não entregar",
    text: "Se o prazo do anúncio passar sem entrega, o valor volta para o seu saldo.",
    href: "/ajuda#prazo-de-entrega",
  },
  {
    icon: Scale,
    title: "Disputa com moderação",
    text: "Algo errado? Abra uma disputa. O valor fica retido até a decisão.",
    href: "/ajuda#quando-abrir-disputa",
  },
]

export function BuyerProtection() {
  return (
    <section
      aria-labelledby="protecao-titulo"
      className="mt-4 flex flex-col gap-1 rounded-xl border border-border bg-card p-4"
    >
      <h2 id="protecao-titulo" className="pb-1 text-sm font-semibold">
        Como protegemos sua compra
      </h2>
      <ul className="flex flex-col">
        {POINTS.map(({ icon: Icon, title, text, href }) => (
          <li key={href}>
            <Link
              href={href}
              className="-mx-2 flex min-w-0 items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{title}</span>
                <span className="text-xs leading-relaxed text-muted-foreground text-pretty">
                  {text}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
