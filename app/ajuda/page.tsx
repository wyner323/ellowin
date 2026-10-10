import type { Metadata } from "next"
import Link from "next/link"
import { ChevronDown, LifeBuoy, Mail, ShieldAlert } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { OpenOnHash } from "@/components/help/open-on-hash"
import { HELP_TOPICS } from "@/lib/help-content"
import { getSupportContact } from "@/lib/support"

export const metadata: Metadata = {
  title: "Central de ajuda",
  description:
    "Respostas sobre comprar, vender, disputas, saque e segurança da conta na Ellowin, o marketplace de produtos digitais para games.",
  alternates: { canonical: "/ajuda" },
}

export default function AjudaPage() {
  const contact = getSupportContact()

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <OpenOnHash />

      <main id="conteudo" className="flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10">
          <header className="flex flex-col gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LifeBuoy className="size-5" aria-hidden="true" />
            </span>
            <h1 className="font-display text-3xl font-bold tracking-tight text-balance">
              Central de ajuda
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground text-pretty">
              Como comprar, vender, resolver um problema e manter a conta segura. As respostas
              descrevem como a Ellowin funciona hoje.
            </p>
            <nav aria-label="Assuntos" className="flex flex-wrap gap-2 pt-1">
              {HELP_TOPICS.map((topic) => (
                <a
                  key={topic.id}
                  href={`#${topic.id}`}
                  className="rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {topic.title}
                </a>
              ))}
            </nav>
          </header>

          {HELP_TOPICS.map((topic) => (
            <section
              key={topic.id}
              id={topic.id}
              aria-labelledby={`${topic.id}-titulo`}
              className="flex scroll-mt-28 flex-col gap-4"
            >
              <div className="flex flex-col gap-1">
                <h2 id={`${topic.id}-titulo`} className="text-xl font-bold tracking-tight">
                  {topic.title}
                </h2>
                <p className="text-sm text-muted-foreground">{topic.summary}</p>
              </div>

              <div className="flex flex-col gap-2">
                {topic.questions.map((q) => (
                  <details
                    key={q.id}
                    id={q.id}
                    className="group scroll-mt-28 rounded-xl border border-border bg-card open:border-primary/40"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3.5 text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                      <span className="text-pretty">{q.question}</span>
                      <ChevronDown
                        className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      />
                    </summary>
                    <div className="flex flex-col gap-3 px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                      {q.answer.map((paragraph) => (
                        <p key={paragraph} className="text-pretty">
                          {paragraph}
                        </p>
                      ))}
                      {q.links?.length ? (
                        <p className="flex flex-wrap gap-x-4 gap-y-1">
                          {q.links.map((link) => (
                            <Link
                              key={link.href}
                              href={link.href}
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {link.label}
                            </Link>
                          ))}
                        </p>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}

          <section
            aria-labelledby="contato-titulo"
            className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6"
          >
            <h2 id="contato-titulo" className="text-xl font-bold tracking-tight">
              Não encontrou o que procurava?
            </h2>

            {contact.email ? (
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Mail className="size-4" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-1 text-sm">
                  <p className="text-muted-foreground">Escreva para a nossa equipe:</p>
                  <a
                    href={`mailto:${contact.email}`}
                    className="font-medium break-all text-primary underline-offset-4 hover:underline"
                  >
                    {contact.email}
                  </a>
                  {contact.hours ? (
                    <p className="text-xs text-muted-foreground">{contact.hours}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldAlert className="size-4" aria-hidden="true" />
              </span>
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                <strong className="font-medium text-foreground">
                  Problema com um pedido?
                </strong>{" "}
                Abra uma disputa pela página do pedido. Ela é acompanhada pela moderação e o valor
                continua retido até a decisão.
                {contact.email ? null : " Um canal de contato direto ainda não está disponível."}
              </p>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
