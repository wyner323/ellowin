import { afterEach, describe, expect, it, vi } from "vitest"

const afterCalls: (() => Promise<void>)[] = []
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => afterCalls.push(fn) }))

import { INDEXNOW_KEY, indexNowBody, indexNowLive, pingIndexNow } from "@/lib/indexnow"

afterEach(() => {
  afterCalls.length = 0
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("IndexNow", () => {
  it("a chave tem o formato aceito pelo protocolo (8 a 128 letras, números ou hífen)", () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-zA-Z0-9-]{8,128}$/)
  })

  it("o corpo traz só endereços do nosso domínio, sem repetir, com o arquivo da chave", () => {
    const body = indexNowBody(["/produtos/a", "/produtos/a", "https://outro.com/x", "/jogos/valorant"])
    expect(body.host).toBe("ellowin.com.br")
    expect(body.key).toBe(INDEXNOW_KEY)
    expect(body.keyLocation).toBe("https://ellowin.com.br/indexnow-key.txt")
    expect(body.urlList).toEqual(["https://ellowin.com.br/produtos/a", "https://ellowin.com.br/jogos/valorant"])
  })

  it("fora da produção não faz nada (o banco local é o de produção)", () => {
    vi.stubEnv("NODE_ENV", "development")
    expect(indexNowLive()).toBe(false)
    pingIndexNow(["/produtos/a"])
    expect(afterCalls).toHaveLength(0)
  })

  it("em produção avisa depois da resposta e uma falha de rede nunca estoura", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL_ENV", "production")
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    pingIndexNow(["/produtos/a"])
    expect(afterCalls).toHaveLength(1)
    await afterCalls[0]()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.indexnow.org/indexnow")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).urlList).toEqual(["https://ellowin.com.br/produtos/a"])

    fetchMock.mockRejectedValue(new Error("rede fora"))
    pingIndexNow(["/produtos/b"])
    await expect(afterCalls[1]()).resolves.toBeUndefined()
  })

  it("lista vazia não chama nada", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL_ENV", "production")
    pingIndexNow([])
    pingIndexNow(["https://outro.com/x"])
    expect(afterCalls).toHaveLength(0)
  })
})
