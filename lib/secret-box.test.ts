import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { randomBytes } from "node:crypto"
import { decryptField, encryptField, hasEncryptionKey, hashField, isEncrypted } from "@/lib/secret-box"

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

describe("sem a chave em produção", () => {
  // O aviso é uma vez por processo: cada teste importa o módulo de novo.
  async function load() {
    vi.resetModules()
    const messages: { message: string; level?: string }[] = []
    vi.doMock("@sentry/nextjs", () => ({
      captureMessage: (message: string, options?: { level?: string }) => messages.push({ message, level: options?.level }),
    }))
    const mod = await import("@/lib/secret-box")
    return { mod, messages }
  }

  afterEach(() => {
    vi.doUnmock("@sentry/nextjs")
    vi.restoreAllMocks()
  })

  it("segue gravando em texto puro, mas avisa (uma vez só) no log e no Sentry", async () => {
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", "")
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL_ENV", "production")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { mod, messages } = await load()

    expect(mod.encryptField("login: x", "order:1")).toBe("login: x")
    expect(mod.encryptField("login: y", "order:2")).toBe("login: y")

    expect(messages).toEqual([{ message: expect.stringContaining("DELIVERY_ENCRYPTION_KEY ausente"), level: "warning" }])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(messages)).not.toContain("login") // o aviso nunca carrega o dado
  })

  it("fora de produção não avisa", async () => {
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", "")
    vi.stubEnv("NODE_ENV", "test")
    const { mod, messages } = await load()
    expect(mod.encryptField("x", "order:1")).toBe("x")
    expect(messages).toEqual([])
  })

  it("com a chave configurada não avisa", async () => {
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", KEY)
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL_ENV", "production")
    const { mod, messages } = await load()
    expect(mod.isEncrypted(mod.encryptField("x", "order:1"))).toBe(true)
    expect(messages).toEqual([])
  })
})

describe("hashField e hasEncryptionKey (estoque de entrega automática)", () => {
  it("sem chave: hasEncryptionKey é falso e hashField recusa (nunca cai em hash sem segredo)", () => {
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", "")
    expect(hasEncryptionKey()).toBe(false)
    expect(() => hashField("CODE-1234", "stock:1")).toThrow(/DELIVERY_ENCRYPTION_KEY/)
  })

  it("com chave: o hash é estável, hexadecimal, e muda com o valor, com o contexto e com a chave", () => {
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", KEY)
    expect(hasEncryptionKey()).toBe(true)
    const h = hashField("CODE-1234", "stock:1")
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashField("CODE-1234", "stock:1")).toBe(h)
    expect(hashField("CODE-1235", "stock:1")).not.toBe(h)
    expect(hashField("CODE-1234", "stock:2")).not.toBe(h)
    expect(h).not.toContain("CODE")
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", randomBytes(32).toString("base64"))
    expect(hashField("CODE-1234", "stock:1")).not.toBe(h) // sem a chave não dá para testar palpites contra o banco
  })

  it("a fronteira valor/contexto não confunde (\"a\"+\"bc\" não colide com \"ab\"+\"c\")", () => {
    vi.stubEnv("DELIVERY_ENCRYPTION_KEY", KEY)
    expect(hashField("bc", "a")).not.toBe(hashField("c", "ab"))
  })
})
