import { afterEach, describe, expect, it, vi } from "vitest"
import { isOwnBlobUrl } from "@/lib/blob-urls"

const HOST = "https://abc123.public.blob.vercel-storage.com"

describe("isOwnBlobUrl", () => {
  it("aceita as fotos de anúncio do próprio usuário", () => {
    expect(isOwnBlobUrl(`${HOST}/produtos/user1/uuid.webp`, "produtos", "user1")).toBe(true)
  })

  it("recusa a foto de anúncio de outro usuário (evita apagar arquivo alheio)", () => {
    expect(isOwnBlobUrl(`${HOST}/produtos/user2/uuid.webp`, "produtos", "user1")).toBe(false)
  })

  it("não deixa user1 casar com user10", () => {
    expect(isOwnBlobUrl(`${HOST}/produtos/user10/uuid.webp`, "produtos", "user1")).toBe(false)
    expect(isOwnBlobUrl(`${HOST}/avatars/user10.webp`, "avatars", "user1")).toBe(false)
  })

  it("aceita avatar e banner do próprio usuário, com o ?v= de cache", () => {
    expect(isOwnBlobUrl(`${HOST}/avatars/user1.webp?v=123`, "avatars", "user1")).toBe(true)
    expect(isOwnBlobUrl(`${HOST}/banners/user1.png?v=9`, "banners", "user1")).toBe(true)
  })

  it("recusa pasta trocada, domínio de fora, http e lixo", () => {
    expect(isOwnBlobUrl(`${HOST}/banners/user1.webp`, "avatars", "user1")).toBe(false)
    expect(isOwnBlobUrl("https://evil.example.com/produtos/user1/a.webp", "produtos", "user1")).toBe(false)
    expect(isOwnBlobUrl("http://abc.public.blob.vercel-storage.com/produtos/user1/a.webp", "produtos", "user1")).toBe(false)
    expect(isOwnBlobUrl("https://x.public.blob.vercel-storage.com.evil.com/produtos/user1/a.webp", "produtos", "user1")).toBe(false)
    expect(isOwnBlobUrl("not a url", "produtos", "user1")).toBe(false)
    expect(isOwnBlobUrl(null, "produtos", "user1")).toBe(false)
    expect(isOwnBlobUrl(`${HOST}/produtos/user1/a.webp`, "produtos", "")).toBe(false)
  })

  it("recusa / e . codificados no caminho (o prefixo do usuário ainda casaria, mas o Blob poderia normalizá-los)", () => {
    expect(isOwnBlobUrl(`${HOST}/produtos/user1/..%2Fuser2/uuid.webp`, "produtos", "user1")).toBe(false)
    expect(isOwnBlobUrl(`${HOST}/produtos/user1/%2e%2e/user2/uuid.webp`, "produtos", "user1")).toBe(false)
    expect(isOwnBlobUrl(`${HOST}/produtos/user1/a%5Cb.webp`, "produtos", "user1")).toBe(false)
    expect(isOwnBlobUrl(`${HOST}/produtos/user1/../user2/uuid.webp`, "produtos", "user1")).toBe(false)
    // um espaço codificado de um nome antigo continua valendo (não derruba a foto já gravada)
    expect(isOwnBlobUrl(`${HOST}/produtos/user1/foto%201.webp`, "produtos", "user1")).toBe(true)
  })

  describe("com ELLOWIN_BLOB_HOST (loja de Blob do app fixada)", () => {
    afterEach(() => vi.unstubAllEnvs())

    it("só aceita a loja do app, mesmo com o id do usuário no caminho", () => {
      vi.stubEnv("ELLOWIN_BLOB_HOST", "abc123.public.blob.vercel-storage.com")
      expect(isOwnBlobUrl(`${HOST}/produtos/user1/uuid.webp`, "produtos", "user1")).toBe(true)
      expect(isOwnBlobUrl(`${HOST}/avatars/user1.webp?v=1`, "avatars", "user1")).toBe(true)
      const outraLoja = "https://outraloja999.public.blob.vercel-storage.com"
      expect(isOwnBlobUrl(`${outraLoja}/produtos/user1/uuid.webp`, "produtos", "user1")).toBe(false)
      expect(isOwnBlobUrl(`${outraLoja}/avatars/user1.png`, "avatars", "user1")).toBe(false)
      expect(isOwnBlobUrl(`${outraLoja}/banners/user1.png`, "banners", "user1")).toBe(false)
    })

    it("a comparação ignora maiúsculas e espaços da variável", () => {
      vi.stubEnv("ELLOWIN_BLOB_HOST", "  ABC123.public.blob.vercel-storage.com ")
      expect(isOwnBlobUrl(`${HOST}/produtos/user1/uuid.webp`, "produtos", "user1")).toBe(true)
    })
  })

  it("sem a variável, continua aceitando qualquer loja do sufixo (não quebra as imagens já gravadas)", () => {
    expect(isOwnBlobUrl("https://outraloja999.public.blob.vercel-storage.com/produtos/user1/uuid.webp", "produtos", "user1")).toBe(true)
  })
})
