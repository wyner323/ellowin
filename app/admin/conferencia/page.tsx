import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { CheckCircle2, ShieldAlert } from "lucide-react"
import { runWalletReconciliation } from "@/lib/reconcile"
import { getCurrentStaff } from "@/lib/roles"

export const metadata: Metadata = { title: "Conferência da carteira" }

// Sempre recalcula: é uma verificação ao vivo, não um relatório guardado.
export const dynamic = "force-dynamic"

const fmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "medium",
})

export default async function ConferenciaPage() {
  const staff = await getCurrentStaff()
  if (staff?.role !== "admin") redirect("/admin/disputas")

  const report = await runWalletReconciliation()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Conferência da carteira</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Confere no banco se o dinheiro bate: saldos com o extrato, custódia com os pedidos em
          andamento, cada pedido liquidado uma única vez e o total da plataforma com depósitos,
          saques e taxas. Só lê — não corrige nada. Roda a cada 15 minutos e avisa os
          administradores por email se algo não bater.
        </p>
      </header>

      {report.ok ? (
        <div className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success/5 p-5">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <div>
            <p className="font-semibold text-success">Tudo bate</p>
            <p className="text-sm text-muted-foreground">
              {report.totals.wallets} carteiras, {report.totals.orders} pedidos e{" "}
              {report.totals.ledgerEntries} lançamentos conferidos em {fmt.format(report.checkedAt)}.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
            <div>
              <p className="font-semibold text-destructive">
                {report.findings.length} {report.findings.length === 1 ? "verificação falhou" : "verificações falharam"}
              </p>
              <p className="text-sm text-muted-foreground">
                Conferido em {fmt.format(report.checkedAt)}. Valores em centavos. Investigue antes
                de liberar novos saques.
              </p>
            </div>
          </div>

          {report.findings.map((finding) => {
            const columns = Object.keys(finding.rows[0] ?? {})
            return (
              <section key={finding.check} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <div>
                  <h2 className="text-sm font-semibold">{finding.description}</h2>
                  <p className="text-xs text-muted-foreground">
                    <code>{finding.check}</code> · {finding.rows.length}{" "}
                    {finding.rows.length === 1 ? "linha" : "linhas"} (até 20)
                  </p>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[420px] text-left text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        {columns.map((c) => (
                          <th key={c} className="px-3 py-2 font-medium">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {finding.rows.map((row, i) => (
                        <tr key={i} className="border-t border-border">
                          {columns.map((c) => (
                            <td key={c} className="px-3 py-2 font-mono tabular-nums">{String(row[c])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
