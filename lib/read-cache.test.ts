import { afterEach, describe, expect, it, vi } from "vitest"

const unstableCache = vi.hoisted(() => vi.fn((fn: unknown) => fn))
vi.mock("next/cache", () => ({ unstable_cache: unstableCache }))

import { cachedRead } from "@/lib/read-cache"

afterEach(() => {
  vi.unstubAllEnvs()
  unstableCache.mockClear()
})

describe("cachedRead", () => {
  it("nos testes devolve a própria função (o banco de teste precisa ser lido de verdade)", () => {
    const fn = async () => 1
    expect(cachedRead(fn, ["x"], 60)).toBe(fn)
    expect(unstableCache).not.toHaveBeenCalled()
  })

  it("em produção guarda por N segundos, com a chave pedida", () => {
    vi.stubEnv("NODE_ENV", "production")
    const fn = async (n: number) => n
    cachedRead(fn, ["market-stats"], 60)
    expect(unstableCache).toHaveBeenCalledWith(fn, ["market-stats"], { revalidate: 60 })
  })
})
