import { describe, expect, it } from "vitest"
import {
  ACCOUNT_ORIGIN_OPTIONS,
  accountOriginLabel,
  accountOriginRetainsRecoveryData,
  isValidAccountOrigin,
  originPurchaseNote,
} from "@/lib/account-origin"

describe("isValidAccountOrigin", () => {
  it("aceita todos os ids declarados nas opções", () => {
    for (const option of ACCOUNT_ORIGIN_OPTIONS) {
      expect(isValidAccountOrigin(option.id)).toBe(true)
    }
  })

  it("rejeita um id desconhecido", () => {
    expect(isValidAccountOrigin("chute_qualquer")).toBe(false)
  })
})

describe("accountOriginLabel", () => {
  it("retorna o rótulo certo pra cada id", () => {
    for (const option of ACCOUNT_ORIGIN_OPTIONS) {
      expect(accountOriginLabel(option.id)).toBe(option.label)
    }
  })

  it("retorna null pra id nulo ou desconhecido", () => {
    expect(accountOriginLabel(null)).toBeNull()
    expect(accountOriginLabel("chute_qualquer")).toBeNull()
  })
})

describe("accountOriginRetainsRecoveryData", () => {
  it("bate com o retainsRecoveryData declarado em cada opção", () => {
    for (const option of ACCOUNT_ORIGIN_OPTIONS) {
      expect(accountOriginRetainsRecoveryData(option.id)).toBe(option.retainsRecoveryData)
    }
  })

  it("retorna false pra id nulo ou desconhecido", () => {
    expect(accountOriginRetainsRecoveryData(null)).toBe(false)
    expect(accountOriginRetainsRecoveryData("chute_qualquer")).toBe(false)
  })
})

describe("originPurchaseNote", () => {
  it("registra o rótulo declarado e diz que a Ellowin não o confere", () => {
    const note = originPurchaseNote("criador_sem_recuperacao")
    expect(note).toContain("declarada pelo vendedor")
    expect(note).toContain("registrada na hora da compra")
    expect(note).toContain("Sou o criador da conta")
    expect(note).not.toContain("dados de recuperação da conta:") // sem aviso extra quando não retém
  })

  it("quando o vendedor declara que ainda tem dados de recuperação, o registro manda trocar tudo antes de confirmar", () => {
    for (const option of ACCOUNT_ORIGIN_OPTIONS.filter((o) => o.retainsRecoveryData)) {
      const note = originPurchaseNote(option.id)
      expect(note).toContain("ainda tem dados de recuperação")
      expect(note).toContain("antes de confirmar o recebimento")
    }
  })

  it("sem procedência válida não há o que registrar", () => {
    expect(originPurchaseNote(null)).toBeNull()
    expect(originPurchaseNote("")).toBeNull()
    expect(originPurchaseNote("inventada")).toBeNull()
  })
})
