import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Lock, Wallet as WalletIcon } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { WalletForms } from "@/components/wallet/wallet-forms"
import { Badge } from "@/components/ui/badge"
import { formatCents } from "@/lib/money"
import { getSession } from "@/lib/session"
import { getWalletEntries, getWalletSummary } from "@/lib/wallet"

export const metadata: Metadata = {
  title: "Carteira",
  description:
    "Saldo disponível, valores em custódia e o extrato completo das suas movimentações na Ellowin.",
}

const KIND_LABEL: Record<string, string> = {
  deposito: "Depósito",
  saque: "Saque",
  compra: "Compra",
  custodia: "Entrada em custódia",
  venda: "Venda recebida",
  reembolso: "Reembolso",
  taxa: "Taxa da plataforma",
}

export default async function CarteiraPage() {
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const userId = session.user.id
  const [summary, entries] = await Promise.all([
    getWalletSummary(userId),
    getWalletEntries(userId),
  ])

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-10">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Carteira</h1>
            <p className="text-sm text-muted-foreground">
              O valor de cada compra fica em custódia até o comprador confirmar o
              recebimento ou a moderação decidir uma disputa.
            </p>
          </header>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <WalletIcon className="size-3.5" aria-hidden="true" />
                Saldo disponível
              </span>
              <strong className="text-3xl font-bold tracking-tight">
                {formatCents(summary.availableCents)}
              </strong>
              <span className="text-xs text-muted-foreground">
                Livre para comprar ou sacar.
              </span>
            </div>

            <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="size-3.5" aria-hidden="true" />
                Em custódia
              </span>
              <strong className="text-3xl font-bold tracking-tight">
                {formatCents(summary.heldCents)}
              </strong>
              <span className="text-xs text-muted-foreground">
                Preso a pedidos em andamento ou em disputa.
              </span>
            </div>
          </div>

          <section className="mt-6" aria-labelledby="movimentar">
            <h2 id="movimentar" className="sr-only">
              Movimentar saldo
            </h2>
            <WalletForms availableCents={summary.availableCents} />
          </section>

          <section className="mt-8 flex flex-col gap-3" aria-labelledby="extrato">
            <h2 id="extrato" className="text-lg font-semibold">
              Extrato
            </h2>

            {entries.length === 0 ? (
              <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Nenhuma movimentação ainda. Adicione saldo para começar a comprar.
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {KIND_LABEL[entry.kind] ?? entry.kind}
                        </span>
                        {entry.orderId ? (
                          <Badge variant="outline" className="text-[0.65rem]">
                            Pedido #{entry.orderId}
                          </Badge>
                        ) : null}
                      </div>
                      {entry.description ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {entry.description}
                        </span>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {entry.createdAt.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="flex flex-col items-end">
                      <strong
                        className={
                          entry.amountCents < 0
                            ? "text-sm font-semibold text-muted-foreground"
                            : "text-sm font-semibold text-primary"
                        }
                      >
                        {entry.amountCents < 0 ? "-" : "+"}
                        {formatCents(Math.abs(entry.amountCents))}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        Saldo: {formatCents(entry.balanceAfterCents)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
