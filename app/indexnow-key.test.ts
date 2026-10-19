import { describe, expect, it } from "vitest"
import { GET } from "@/app/indexnow-key.txt/route"
import { INDEXNOW_KEY } from "@/lib/indexnow"

describe("/indexnow-key.txt", () => {
  it("devolve exatamente a chave, em texto puro", async () => {
    const res = GET()
    expect(res.headers.get("content-type")).toContain("text/plain")
    expect(await res.text()).toBe(INDEXNOW_KEY)
  })
})
