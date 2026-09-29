import { describe, expect, it } from "vitest"
import { isValidReportReason, reportReasonLabel } from "@/lib/reports"

describe("reports", () => {
  it("reconhece motivos válidos e recusa o resto", () => {
    expect(isValidReportReason("golpe")).toBe(true)
    expect(isValidReportReason("outro")).toBe(true)
    expect(isValidReportReason("")).toBe(false)
    expect(isValidReportReason("inventado")).toBe(false)
  })

  it("devolve o rótulo certo, e 'Outro motivo' para valor desconhecido", () => {
    expect(reportReasonLabel("conta_invadida")).toBe("Vendeu uma conta invadida ou já recuperada")
    expect(reportReasonLabel("xyz")).toBe("Outro motivo")
  })
})
