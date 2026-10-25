import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Download, Receipt } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { SellerTabs } from "@/components/seller/seller-tabs"
import { Button } from "@/components/ui/button"
import { formatPercent } from "@/lib/analytics-math"
import { getSellerUnansweredQuestionsCount } from "@/lib/marketplace"
import { formatCents, PLATFORM_FEE_BPS } from "@/lib/money"
import { getMonthlyStatement, STATEMENT_MONTHS } from "@/lib/seller-statement"
import { getSession } from "@/lib/session"
import { effectiveFeePercent, monthName, totals } from "@/lib/statement-math"

export const metadata: Metadata = {
  title: "Extrato de taxas",
}

/** Quanto o vendedor vendeu, pagou de taxa e recebeu, mês a mês (vendas concluídas dos últimos 12 meses). */
export default async function ExtratoPage() {
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const [months, pendingQuestions] = await Promise.all([
    getMonthlyStatement(session.user.id),
    getSellerUnansweredQuestionsCount(session.user.id),
  ])
  const total = totals(months)

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <SellerTabs pendingQuestions={pendingQuestions} />

      <main id="conteudo" className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
          <div>
            <Button render={<Link href="/painel/vendedor/vendas" />} variant="ghost" size="sm" className="-ml-2">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Minhas vendas
            </Button>
          </div>

          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-2xl font-bold tracking-tight">Extrato de taxas</h1>
              <p className="max-w-prose text-sm text-muted-foreground">
                Vendas concluídas dos últimos {STATEMENT_MONTHS} meses, no mês em que o valor foi liberado a você (horário de Brasília). A taxa da plataforma é de{" "}
                {(PLATFORM_FEE_BPS / 100).toLocaleString("pt-BR")}% sobre cada venda.
              </p>
            </div>
            {total.sales > 0 ? (
              <Button render={<Link href="/painel/vendedor/extrato/exportar" prefetch={false} />} variant="outline" size="sm">
                <Download className="size-3.5" aria-hidden="true" />
                Exportar CSV
              </Button>
            ) : null}
          </header>

          {total.sales === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
              <Receipt className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">Nenhuma venda concluída nos últimos {STATEMENT_MONTHS} meses</p>
              <p className="text-sm text-muted-foreground">O extrato aparece aqui depois da primeira venda concluída.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[40rem] text-sm">
                <caption className="sr-only">Vendas, taxas e valor recebido por mês</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">Mês</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Vendas</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Pago pelos compradores</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Taxa Ellowin</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Você recebeu</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month} className="border-b border-border last:border-0">
                      <th scope="row" className="px-4 py-2.5 text-left font-medium first-letter:uppercase">
                        {monthName(m.month)}
                      </th>
                      <td className="px-4 py-2.5 text-right tabular-nums">{m.sales}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{m.sales > 0 ? formatCents(m.grossCents) : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {m.sales > 0 ? (
                          <>
                            {formatCents(m.feeCents)}
                            <span className="ml-1 text-xs text-muted-foreground">({formatPercent(effectiveFeePercent(m.grossCents, m.feeCents))})</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{m.sales > 0 ? formatCents(m.netCents) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/30 font-semibold">
                    <th scope="row" className="px-4 py-3 text-left">Total</th>
                    <td className="px-4 py-3 text-right tabular-nums">{total.sales}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCents(total.grossCents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCents(total.feeCents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCents(total.netCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Este extrato resume as suas vendas na plataforma e não é documento fiscal. Pedidos reembolsados ou cancelados não entram.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
