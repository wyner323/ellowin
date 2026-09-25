import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { randomBytes } from "node:crypto"
import { decryptField, encryptField, isEncrypted } from "@/lib/secret-box"

const KEY = randomBytes(32).toString("base64")

afterEach(() => vi.unstubAllEnvs())

describe("secret-box com chave", () => {
  beforeEach(() => vi.stubEnv("DELIVERY_ENCRYPTION_KEY", KEY))

  it("cifra e decifra, e o texto cifrado não contém o original", () => {
    const secret = "login: gamer123 / senha: hunter2"
    const boxed = encryptField(secret, "order:1")
    expect(isEncrypted(boxed)).toBe(true)
    expect(boxed).not.toContain("hunter2")
    expect(decryptField(boxed, "order:1")).toBe(secret)
  })

  it("cada cifragem usa um IV novo", () => {
    expect(encryptField("x", "order:1")).not.toBe(encryptField("x", "order:1"))
  })

  it("recusa contexto trocado (valor copiado para outro pedido) e adulteração", () => {
    const boxed = encryptField("dados", "order:1")
    expect(() => decryptField(boxed, "order:2")).toThrow()

    const parts = boxed.split(":")
    parts[4] = Buffer.from("adulterado").toString("base64")
    expect(() => decryptField(parts.join(":"), "order:1")).toThrow()
  })

  it("texto puro legado continua legível", () => {
    expect(decryptField("senha antiga", "order:9")).toBe("senha antiga")
  })

  it("suporta acentos e emoji", () => {
    const text = "código: ação-ção 🎮"
    expect(decryptField(encryptField(text, "order:3"), "order:3")).toBe(text)
  })
})

describe("secret-box sem chave", () => {
  it("grava em texto puro (não quebra o deploy) e não lê dado cifrado", () => {
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", KEY)
    const boxed = encryptField("x", "order:1")
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", "")

    expect(encryptField("plain", "order:1")).toBe("plain")
    expect(() => decryptField(boxed, "order:1")).toThrow(/DELIVERY_ENCRYPTION_KEY/)
  })

  it("chave com tamanho errado é erro explícito", () => {
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", Buffer.from("curta").toString("base64"))
    expect(() => encryptField("x", "order:1")).toThrow(/32 bytes/)
  })
})
