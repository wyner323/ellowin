/**
 * Motivos e status de denúncia, num módulo sem dependência de banco — mesmo
 * padrão de lib/disputes.ts. Usado tanto no formulário (cliente) quanto na
 * fila de moderação.
 */
export const REPORT_REASONS = [
  { value: "golpe", label: "Golpe ou tentativa de fraude" },
  { value: "conta_invadida", label: "Vendeu uma conta invadida ou já recuperada" },
  { value: "enganoso", label: "Anúncio enganoso ou produto diferente do descrito" },
  { value: "fora_da_plataforma", label: "Tentou negociar fora da plataforma" },
  { value: "assedio", label: "Assédio ou comportamento abusivo" },
  { value: "outro", label: "Outro motivo" },
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]["value"]
export type ReportTargetType = "anuncio" | "usuario"
export type ReportStatus = "aberta" | "em_analise" | "resolvida" | "arquivada"

export function reportReasonLabel(value: string) {
  return REPORT_REASONS.find((r) => r.value === value)?.label ?? "Outro motivo"
}

export function isValidReportReason(value: string): value is ReportReason {
  return REPORT_REASONS.some((r) => r.value === value)
}

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  aberta: "Aberta",
  em_analise: "Em análise",
  resolvida: "Resolvida — irregularidade confirmada",
  arquivada: "Arquivada — sem irregularidade encontrada",
}

export const OPEN_REPORT_STATUSES: ReportStatus[] = ["aberta", "em_analise"]

export const MIN_REPORT_DESCRIPTION = 10
export const MAX_REPORT_DESCRIPTION = 1000
