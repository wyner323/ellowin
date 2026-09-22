import { describe, expect, it } from "vitest"
import {
  ACCOUNT_ORIGIN_OPTIONS,
  accountOriginLabel,
  accountOriginRetainsRecoveryData,
  isValidAccountOrigin,
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
