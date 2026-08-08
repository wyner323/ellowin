/**
 * Motivos de disputa, num módulo sem dependência de banco.
 *
 * Ficam fora de `app/actions/disputes.ts` porque um arquivo de server actions só
 * pode exportar funções async, e fora de `lib/sla.ts` porque este dado é usado
 * também no formulário do comprador, que roda no cliente.
 */
export const DISPUTE_REASONS = [
  { value: "nao_entregue", label: "Não recebi o produto" },
  { value: "diferente", label: "O produto é diferente do anunciado" },
  { value: "nao_funciona", label: "O produto não funciona / conta recuperada" },
  { value: "cobranca", label: "Problema de cobrança" },
  { value: "outro", label: "Outro motivo" },
] as const

export type DisputeReason = (typeof DISPUTE_REASONS)[number]["value"]

export function disputeReasonLabel(value: string) {
  return DISPUTE_REASONS.find((r) => r.value === value)?.label ?? "Outro motivo"
}
