import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AlertTriangle, PackageCheck } from "lucide-react"
import { FLAG_DISPUTE_PERCENT, FLAG_MIN_ORDERS, getAutoDeliverySellers } from "@/lib/auto-delivery-monitor"
import { formatPercent } from "@/lib/analytics-math"
import { getStaff } from "@/lib/roles"

export const metadata: Metadata = { title: "Vendedores com entrega automática" }

export const dynamic = "force-dynamic"

/**
 * Para a moderação: como estão as disputas dos vendedores que vendem por entrega automática (qualquer vendedor aprovado
 * pode usar, sem trava de vendas). O acesso é da equipe (layout da moderação) e conferido aqui de novo.
 */
export default async function EntregaAutomaticaPage() {
  // getStaff (não getCurrentStaff): só moderador e administrador. getCurrentStaff devolve qualquer usuário logado.
  const staff = await getStaff()
  if (!staff) redirect("/")

  const { available, rows } = await getAutoDeliverySellers()
  const flagged = rows.filter((r) => r.flagged).length

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Vendedores com entrega automática</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Pedidos entregues pelo estoque de itens, por vendedor. A taxa de disputa é o número de disputas dividido pelo de pedidos. Um vendedor fica em atenção a partir de {FLAG_MIN_ORDERS} pedidos e{" "}
          {FLAG_DISPUTE_PERCENT}% de disputas: é um sinal para olhar com cuidado, não uma conclusão. Código inválido entregue em massa costuma aparecer aqui primeiro.
        </p>
      </header>

      {!available ? (
        <p role="status" className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
          A entrega automática ainda não foi ativada na plataforma (falta aplicar a atualização do banco de dados), então não há o que acompanhar.
        </p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
          <PackageCheck className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhum pedido de entrega automática ainda</p>
          <p className="text-sm text-muted-foreground">Quando houver vendas pelo estoque de itens, os vendedores aparecem aqui.</p>
        </div>
      ) : (
        <>
          <p className={flagged > 0 ? "flex items-center gap-2 text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
            {flagged > 0 ? <AlertTriangle className="size-4" aria-hidden="true" /> : null}
            {flagged > 0 ? `${flagged} ${flagged === 1 ? "vendedor em atenção" : "vendedores em atenção"}` : "Nenhum vendedor em atenção."}
          </p>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">Pedidos e disputas por vendedor de entrega automática</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Vendedor</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Pedidos</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Disputas</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Taxa</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">A favor do comprador</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Reembolsados</th>
                  <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sellerId} className="border-b border-border last:border-0">
                    <th scope="row" className="px-4 py-2.5 text-left font-medium">{r.name}</th>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.orders}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.disputes}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatPercent(r.disputePercent)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.buyerWon}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.refunded}</td>
                    <td className="px-4 py-2.5">
                      {r.flagged ? (
                        <span className="inline-flex items-center gap-1 font-medium text-destructive">
                          <AlertTriangle className="size-3.5" aria-hidden="true" />
                          Em atenção
                        </span>
                      ) : r.orders < FLAG_MIN_ORDERS ? (
                        <span className="text-muted-foreground">Poucos pedidos</span>
                      ) : (
                        <span className="text-muted-foreground">Dentro do esperado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Para agir, abra as disputas na{" "}
        <Link href="/admin/disputas" className="font-medium text-primary hover:underline">
          fila de disputas
        </Link>
        . Só nomes públicos das lojas aparecem aqui.
      </p>
    </div>
  )
}
