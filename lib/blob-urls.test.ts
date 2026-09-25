import { describe, expect, it } from "vitest"
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
})
