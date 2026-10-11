import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Rotas de envio de imagem (`/api/produtos/upload`, `/api/perfil/avatar`,
 * `/api/perfil/banner`) contra um Postgres em memória com as migrações reais.
 * O Vercel Blob é simulado (grava só o que foi pedido); o resto — sessão, regra de
 * vendedor aprovado, limite por hora, conferência do CONTEÚDO do arquivo — é real.
 * O ponto central: nada do que o navegador declara (nome, tipo) decide o que é
 * gravado nem onde.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
  puts: [] as { path: string; options: Record<string, unknown> }[],
  putFails: false,
}))

vi.mock("@/lib/db", () => ({
  get db() {
    return holder.db
  },
  pool: {
    query: (text: string, params?: unknown[]) => holder.pool.query(text, params),
    connect: () => holder.pool.connect(),
  },
}))
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => {
        if (!holder.userId) return null
        const { rows } = await holder.pool.query(`SELECT "id", "email", "emailVerified" FROM "user" WHERE "id" = $1`, [holder.userId])
        return rows[0] ? { user: rows[0] } : null
      },
    },
  },
}))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
// NextResponse continua real; só o `after` (que exige um request do Next) vira vazio.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => {} }))
vi.mock("@vercel/blob", () => ({
  put: async (path: string, _file: unknown, options: Record<string, unknown>) => {
    if (holder.putFails) throw new Error("segredo-interno-do-blob: token abc123")
    holder.puts.push({ path, options })
    return { url: `https://abc123.public.blob.vercel-storage.com/${path}` }
  },
}))

import { POST as postAvatar } from "@/app/api/perfil/avatar/route"
import { POST as postBanner } from "@/app/api/perfil/banner/route"
import { POST as postProduct } from "@/app/api/produtos/upload/route"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

beforeEach(async () => {
  holder.userId = null
  holder.puts.length = 0
  holder.putFails = false
  await t.query(`TRUNCATE "auth_attempt", "seller_application", "user" RESTART IDENTITY CASCADE`)
  await addUser("ana", "aprovado") // vendedora aprovada
  await addUser("bia", null) // usuária comum
  await addUser("cadu", "em_andamento") // candidatura ainda em andamento
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

async function addUser(id: string, seller: string | null) {
  await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $1 || '@teste.dev')`, [id])
  if (seller) await t.query(`INSERT INTO "seller_application" ("userId", "status") VALUES ($1, $2)`, [id, seller])
}

/** Literal de propósito: o teste não pode acompanhar a constante do código se ela for alterada. */
const FIVE_MB = 5 * 1024 * 1024

const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0))

/** Primeiros bytes (assinatura) de cada formato aceito, seguidos de enchimento. */
const SIGNATURE = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10],
  webp: [...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")],
  avif: [0, 0, 0, 0x1c, ...ascii("ftyp"), ...ascii("avif")],
}

function imageFile(kind: keyof typeof SIGNATURE | "html" | "svg" | "exe", opts: { name?: string; type?: string; bytes?: number } = {}) {
  const head =
    kind === "html" ? ascii("<!doctype html><script>alert(1)</script>") : kind === "svg" ? ascii("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>") : kind === "exe" ? [0x4d, 0x5a, 0x90, 0x00] : SIGNATURE[kind]
  const body = new Uint8Array(Math.max(opts.bytes ?? 64, head.length))
  body.set(head)
  return new File([body], opts.name ?? "foto.bin", { type: opts.type ?? "image/png" })
}

function upload(file: unknown, field = "file") {
  const form = new FormData()
  if (file !== undefined) form.set(field, file as Blob | string)
  return new Request("http://localhost/api/upload", { method: "POST", body: form })
}

const ROUTES = [
  { name: "foto de anúncio", post: postProduct, user: "ana", limit: 40, folder: "produtos" },
  { name: "avatar", post: postAvatar, user: "bia", limit: 10, folder: "avatars" },
  { name: "banner", post: postBanner, user: "bia", limit: 10, folder: "banners" },
] as const

/* ---------------------------------------------------------------------------
 * Regras comuns às três rotas
 * ------------------------------------------------------------------------ */

describe.each(ROUTES)("envio de $name", ({ post, user, limit, folder }) => {
  it("exige estar logado (401)", async () => {
    holder.userId = null
    const res = await post(upload(imageFile("png")) as never)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Não autorizado." })
    expect(holder.puts).toHaveLength(0)
  })

  it("aceita cada formato real (PNG, JPEG, WebP, AVIF) e devolve a URL", async () => {
    holder.userId = user
    for (const kind of ["png", "jpeg", "webp", "avif"] as const) {
      const res = await post(upload(imageFile(kind)) as never)
      expect(res.status, kind).toBe(200)
      expect((await res.json()).url, kind).toContain(`/${folder}/${user}`)
    }
    expect(holder.puts).toHaveLength(4)
  })

  it("o formato gravado vem do CONTEÚDO, não do nome nem do tipo declarado pelo navegador", async () => {
    holder.userId = user
    await post(upload(imageFile("png", { name: "foto.exe", type: "application/x-msdownload" })) as never)
    await post(upload(imageFile("jpeg", { name: "../../etc/passwd", type: "text/plain" })) as never)

    const [first, second] = holder.puts
    expect(first.path).toMatch(/\.png$/)
    expect(first.options.contentType).toBe("image/png")
    expect(second.path).toMatch(/\.jpg$/)
    expect(second.options.contentType).toBe("image/jpeg")
    for (const p of holder.puts) {
      expect(p.path).not.toContain("..")
      expect(p.path).not.toContain("passwd")
      expect(p.path).not.toContain("exe")
      expect(p.path.startsWith(`${folder}/${user}`)).toBe(true)
    }
  })

  it("recusa o que só finge ser imagem (HTML, SVG, executável) mesmo com tipo 'image/png' (400)", async () => {
    holder.userId = user
    for (const kind of ["html", "svg", "exe"] as const) {
      const res = await post(upload(imageFile(kind, { name: "foto.png", type: "image/png" })) as never)
      expect(res.status, kind).toBe(400)
      expect((await res.json()).error, kind).toContain("Formato inválido")
    }
    expect(holder.puts).toHaveLength(0)
  })

  it("recusa arquivo vazio, ausente ou que não é arquivo (400)", async () => {
    holder.userId = user
    expect((await post(upload(new File([], "vazio.png", { type: "image/png" })) as never)).status).toBe(400)
    expect((await post(upload(undefined) as never)).status).toBe(400)
    expect((await post(upload("isso é texto, não arquivo") as never)).status).toBe(400)
    expect((await post(upload(imageFile("png"), "outro-campo") as never)).status).toBe(400)
    expect(holder.puts).toHaveLength(0)
  })

  it("recusa imagem acima de 5 MB e aceita no limite", async () => {
    holder.userId = user
    const big = await post(upload(imageFile("png", { bytes: FIVE_MB + 1 })) as never)
    expect(big.status).toBe(400)
    expect((await big.json()).error).toContain("5 MB")
    expect(holder.puts).toHaveLength(0)

    expect((await post(upload(imageFile("png", { bytes: FIVE_MB })) as never)).status).toBe(200)
  })

  it("limita a quantidade de envios por hora por pessoa (429), sem gravar o excedente", async () => {
    holder.userId = user
    for (let i = 0; i < limit; i++) expect((await post(upload(imageFile("webp")) as never)).status, `envio ${i + 1}`).toBe(200)

    const blocked = await post(upload(imageFile("webp")) as never)
    expect(blocked.status).toBe(429)
    expect((await blocked.json()).error).toContain("Muitos envios")
    expect(holder.puts).toHaveLength(limit)
  })

  it("falha do armazenamento vira erro genérico (500), sem vazar o segredo interno", async () => {
    holder.userId = user
    holder.putFails = true
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await post(upload(imageFile("png")) as never)
    consoleError.mockRestore()

    expect(res.status).toBe(500)
    const text = JSON.stringify(await res.json())
    expect(text).toContain("Não foi possível enviar a imagem.")
    expect(text).not.toContain("segredo-interno")
    expect(text).not.toContain("abc123")
  })
})

/* ---------------------------------------------------------------------------
 * Particularidades de cada rota
 * ------------------------------------------------------------------------ */

describe("foto de anúncio: só vendedor aprovado", () => {
  it("usuário comum e candidatura em andamento recebem 403 e nada é gravado", async () => {
    for (const who of ["bia", "cadu"]) {
      holder.userId = who
      const res = await postProduct(upload(imageFile("png")) as never)
      expect(res.status, who).toBe(403)
      expect((await res.json()).error).toContain("cadastro de vendedor")
    }
    expect(holder.puts).toHaveLength(0)
  })

  it("o caminho tem o id do vendedor e um nome aleatório (nunca o nome do arquivo enviado)", async () => {
    holder.userId = "ana"
    await postProduct(upload(imageFile("png", { name: "minha-foto-original.png" })) as never)
    await postProduct(upload(imageFile("png", { name: "minha-foto-original.png" })) as never)

    const [a, b] = holder.puts
    expect(a.path).toMatch(/^produtos\/ana\/[0-9a-f-]{36}\.png$/)
    expect(b.path).toMatch(/^produtos\/ana\/[0-9a-f-]{36}\.png$/)
    expect(a.path).not.toBe(b.path)
    expect(a.path).not.toContain("minha-foto")
    expect(a.options.allowOverwrite).toBeUndefined() // cada foto é um arquivo novo
    expect(a.options.access).toBe("public")
  })

  it("o limite de fotos de anúncio (40/h) não é o mesmo do avatar (10/h) nem é compartilhado entre pessoas", async () => {
    holder.userId = "ana"
    for (let i = 0; i < 12; i++) expect((await postProduct(upload(imageFile("png")) as never)).status).toBe(200)

    holder.userId = "bia"
    for (let i = 0; i < 10; i++) await postAvatar(upload(imageFile("png")) as never)
    expect((await postAvatar(upload(imageFile("png")) as never)).status).toBe(429)

    // A outra pessoa e a outra rota seguem livres.
    holder.userId = "ana"
    expect((await postAvatar(upload(imageFile("png")) as never)).status).toBe(200)
    expect((await postProduct(upload(imageFile("png")) as never)).status).toBe(200)
  })
})

describe("avatar e banner", () => {
  it("usam um nome fixo por usuário que SUBSTITUI o anterior, e a URL ganha ?v= para furar o cache", async () => {
    holder.userId = "bia"
    const first = await (await postAvatar(upload(imageFile("png")) as never)).json()
    const second = await (await postAvatar(upload(imageFile("webp")) as never)).json()

    expect(holder.puts[0]).toMatchObject({ path: "avatars/bia.png", options: { allowOverwrite: true, access: "public", contentType: "image/png" } })
    expect(holder.puts[1].path).toBe("avatars/bia.webp")
    expect(first.url).toMatch(/\/avatars\/bia\.png\?v=\d+$/)
    expect(second.url).toMatch(/\/avatars\/bia\.webp\?v=\d+$/)

    const banner = await (await postBanner(upload(imageFile("jpeg")) as never)).json()
    expect(holder.puts[2]).toMatchObject({ path: "banners/bia.jpg", options: { allowOverwrite: true, contentType: "image/jpeg" } })
    expect(banner.url).toMatch(/\/banners\/bia\.jpg\?v=\d+$/)
  })

  it("não exigem ser vendedor, e cada pessoa só grava no próprio caminho", async () => {
    for (const who of ["ana", "bia", "cadu"]) {
      holder.userId = who
      expect((await postAvatar(upload(imageFile("png")) as never)).status, who).toBe(200)
    }
    expect(holder.puts.map((p) => p.path)).toEqual(["avatars/ana.png", "avatars/bia.png", "avatars/cadu.png"])
  })

  it("a URL devolvida passa na validação que as ações de conta fazem (isOwnBlobUrl)", async () => {
    const { isOwnBlobUrl } = await import("@/lib/blob-urls")
    holder.userId = "bia"
    const avatar = (await (await postAvatar(upload(imageFile("png")) as never)).json()).url as string
    const banner = (await (await postBanner(upload(imageFile("png")) as never)).json()).url as string
    expect(isOwnBlobUrl(avatar, "avatars", "bia")).toBe(true)
    expect(isOwnBlobUrl(banner, "banners", "bia")).toBe(true)
    expect(isOwnBlobUrl(avatar, "avatars", "ana")).toBe(false)

    holder.userId = "ana"
    const product = (await (await postProduct(upload(imageFile("png")) as never)).json()).url as string
    expect(isOwnBlobUrl(product, "produtos", "ana")).toBe(true)
    expect(isOwnBlobUrl(product, "produtos", "bia")).toBe(false)
  })
})
