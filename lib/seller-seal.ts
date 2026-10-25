/**
 * Selo de Certificação: "sem registros de conta recuperada". Um vendedor sem NENHUMA venda concluída também não tem
 * registro nenhum, mas isso não prova nada: o selo só vale como evidência quando há histórico. Então ele passa a vir
 * com o número de vendas concluídas, e vendedor novo aparece como novo (sem selo). Puro, para as telas e os testes.
 */

export type SealState =
  /** a moderação marcou conta(s) recuperada(s) contra o vendedor */
  | { kind: "registros"; count: number; lastFlaggedAt: Date | null }
  /** sem registros, mas também sem histórico: não há o que certificar */
  | { kind: "novo" }
  /** sem registros em `sales` vendas concluídas */
  | { kind: "certificado"; sales: number }

export function sealState(input: { flagCount: number; completedSales: number; lastFlaggedAt?: Date | null }): SealState {
  if (input.flagCount > 0) return { kind: "registros", count: input.flagCount, lastFlaggedAt: input.lastFlaggedAt ?? null }
  if (input.completedSales <= 0) return { kind: "novo" }
  return { kind: "certificado", sales: input.completedSales }
}

const sales = (n: number) => `${n} ${n === 1 ? "venda concluída" : "vendas concluídas"}`

/** O texto do selo, igual em todas as telas (anúncio, loja, verificador). Nulo quando há registros (cada tela mostra o aviso). */
export function sealText(state: SealState): string | null {
  if (state.kind === "certificado") return `Selo de Certificação: sem registros de conta recuperada em ${sales(state.sales)}`
  if (state.kind === "novo") return "Vendedor novo: ainda sem vendas concluídas, então não há histórico para certificar"
  return null
}
