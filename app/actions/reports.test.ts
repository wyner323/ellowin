import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { MAX_REPORT_DESCRIPTION, MIN_REPORT_DESCRIPTION, REPORT_REASONS } from "@/lib/reports"

/**
 * Denúncias (anúncio ou usuário) e a fila de moderação, contra um Postgres em
 * memória com as migrações reais. Denúncia nunca mexe em dinheiro: só registra
 * o caso e o que a moderação decidiu.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
  ip: "203.0.113.7" as string | null,
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
vi.mock("next/headers", () => ({
  headers: async () => new Headers(holder.ip ? { "x-real-ip": holder.ip } : {}),
}))
vi.mock("next/server", () => ({ after: () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

import { claimReport, reportListing, reportUser, resolveReport } from "@/app/actions/reports"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

const REASON = REPORT_REASONS[0].value
const DESC = "O anúncio promete uma conta que não existe, é golpe."

beforeEach(async () => {
  holder.userId = null
  await t.query(`TRUNCATE "auth_attempt", "report", "product_variant", "product", "user" RESTART IDENTITY CASCADE`)
  await addUser("ana") // denunciante
  await addUser("bia") // vendedora denunciada
  await addUser("cadu") // outro denunciante
  await addUser("mod", "moderator")
  await addUser("mod2", "moderator")
  productId = await addProduct("bia")
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

let productId = 0

async function addUser(id: string, role = "user") {
  await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified", "role") VALUES ($1, $1, $1 || '@teste.dev', true, $2)`, [id, role])
}

async function addProduct(sellerId: string) {
  const { rows } = await t.query(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ($1, 'p-' || gen_random_uuid()::text, 'Conta Valorant', 'contas') RETURNING "id"`,
    [sellerId],
  )
  return rows[0].id as number
}

async function rows(text: string, params?: unknown[]) {
  return (await t.query(text, params)).rows
}

type ReportRow = {
  id: number
  reporterId: string
  targetType: string
  targetProductId: number | null
  targetUserId: string | null
  reason: string
  description: string
  status: string
  moderatorId: string | null
  resolutionNote: string | null
  resolvedAt: Date | null
}

const reports = () => rows(`SELECT * FROM "report" ORDER BY "id"`) as Promise<ReportRow[]>
const reportById = async (id: number) => (await rows(`SELECT * FROM "report" WHERE "id" = $1`, [id]))[0] as ReportRow

async function fileListingReport(as = "ana", target = productId) {
  holder.userId = as
  const r = await reportListing({ productId: target, reason: REASON, description: DESC })
  expect(r.ok, r.error).toBe(true)
  return (await reports()).at(-1)!.id
}

/* ---------------------------------------------------------------------------
 * reportListing
 * ------------------------------------------------------------------------ */

describe("reportListing", () => {
  it("registra a denúncia como aberta, com o denunciante da sessão e a descrição sem espaços nas pontas", async () => {
    holder.userId = "ana"
    const result = await reportListing({ productId, reason: REASON, description: `  ${DESC}  ` })

    expect(result).toMatchObject({ ok: true })
    expect(await reports()).toEqual([
      expect.objectContaining({ reporterId: "ana", targetType: "anuncio", targetProductId: productId, targetUserId: null, reason: REASON, description: DESC, status: "aberta", moderatorId: null }),
    ])
  })

  it("exige estar logado", async () => {
    holder.userId = null
    await expect(reportListing({ productId, reason: REASON, description: DESC })).rejects.toThrow("Não autenticado")
  })

  it("valida o motivo e o tamanho da descrição", async () => {
    holder.userId = "ana"
    expect(await reportListing({ productId, reason: "inventado", description: DESC })).toMatchObject({ ok: false })
    expect(await reportListing({ productId, reason: REASON, description: "x".repeat(MIN_REPORT_DESCRIPTION - 1) })).toMatchObject({ ok: false })
    expect(await reportListing({ productId, reason: REASON, description: "   curta   " })).toMatchObject({ ok: false })
    expect(await reportListing({ productId, reason: REASON, description: "x".repeat(MAX_REPORT_DESCRIPTION + 1) })).toMatchObject({ ok: false })
    expect(await reports()).toHaveLength(0)

    expect((await reportListing({ productId, reason: REASON, description: "x".repeat(MIN_REPORT_DESCRIPTION) })).ok).toBe(true)
  })

  it("aceita cada motivo da lista", async () => {
    holder.userId = "ana"
    for (const { value } of REPORT_REASONS) {
      const target = await addProduct("bia")
      expect((await reportListing({ productId: target, reason: value, description: DESC })).ok, value).toBe(true)
    }
  })

  it("anúncio inexistente e o próprio anúncio são recusados", async () => {
    holder.userId = "ana"
    expect(await reportListing({ productId: 999_999, reason: REASON, description: DESC })).toEqual({ ok: false, error: "Anúncio não encontrado." })
    holder.userId = "bia"
    expect(await reportListing({ productId, reason: REASON, description: DESC })).toMatchObject({ ok: false, error: expect.stringContaining("próprio anúncio") })
    expect(await reports()).toHaveLength(0)
  })

  it("não duplica a denúncia aberta do mesmo denunciante, mesmo em análise", async () => {
    const id = await fileListingReport("ana")
    expect(await reportListing({ productId, reason: REASON, description: DESC })).toMatchObject({ ok: false, error: expect.stringContaining("já denunciou") })

    await t.query(`UPDATE "report" SET "status" = 'em_analise' WHERE "id" = $1`, [id])
    expect((await reportListing({ productId, reason: REASON, description: DESC })).ok).toBe(false)
    expect(await reports()).toHaveLength(1)
  })

  it("depois que o caso é encerrado dá para denunciar de novo; outra pessoa pode denunciar o mesmo anúncio", async () => {
    const id = await fileListingReport("ana")
    holder.userId = "cadu"
    expect((await reportListing({ productId, reason: REASON, description: DESC })).ok).toBe(true)

    await t.query(`UPDATE "report" SET "status" = 'resolvida' WHERE "id" = $1`, [id])
    holder.userId = "ana"
    expect((await reportListing({ productId, reason: REASON, description: DESC })).ok).toBe(true)
    expect(await reports()).toHaveLength(3)
  })

  it("limita a 10 denúncias por hora por pessoa (anúncios e usuários juntos)", async () => {
    holder.userId = "ana"
    for (let i = 0; i < 10; i++) {
      const target = await addProduct("bia")
      expect((await reportListing({ productId: target, reason: REASON, description: DESC })).ok, `denúncia ${i + 1}`).toBe(true)
    }
    const blocked = await reportListing({ productId: await addProduct("bia"), reason: REASON, description: DESC })
    expect(blocked).toMatchObject({ ok: false, error: expect.stringContaining("Muitas denúncias") })
    expect(await reportUser({ targetUserId: "bia", reason: REASON, description: DESC })).toMatchObject({ ok: false, error: expect.stringContaining("Muitas denúncias") })
    expect(await reports()).toHaveLength(10)

    holder.userId = "cadu"
    expect((await reportListing({ productId, reason: REASON, description: DESC })).ok).toBe(true)
  })
})

/* ---------------------------------------------------------------------------
 * reportUser
 * ------------------------------------------------------------------------ */

describe("reportUser", () => {
  it("registra a denúncia de usuário", async () => {
    holder.userId = "ana"
    expect(await reportUser({ targetUserId: "bia", reason: REASON, description: DESC })).toMatchObject({ ok: true })
    expect(await reports()).toEqual([
      expect.objectContaining({ reporterId: "ana", targetType: "usuario", targetUserId: "bia", targetProductId: null, status: "aberta" }),
    ])
  })

  it("exige estar logado; não deixa denunciar a si mesmo nem alguém que não existe", async () => {
    holder.userId = null
    await expect(reportUser({ targetUserId: "bia", reason: REASON, description: DESC })).rejects.toThrow("Não autenticado")

    holder.userId = "ana"
    expect(await reportUser({ targetUserId: "ana", reason: REASON, description: DESC })).toMatchObject({ ok: false, error: expect.stringContaining("a si mesmo") })
    expect(await reportUser({ targetUserId: "fantasma", reason: REASON, description: DESC })).toEqual({ ok: false, error: "Usuário não encontrado." })
    expect(await reports()).toHaveLength(0)
  })

  it("valida motivo e descrição, e não duplica a denúncia aberta", async () => {
    holder.userId = "ana"
    expect(await reportUser({ targetUserId: "bia", reason: "x", description: DESC })).toMatchObject({ ok: false })
    expect(await reportUser({ targetUserId: "bia", reason: REASON, description: "curta" })).toMatchObject({ ok: false })

    expect((await reportUser({ targetUserId: "bia", reason: REASON, description: DESC })).ok).toBe(true)
    expect(await reportUser({ targetUserId: "bia", reason: REASON, description: DESC })).toMatchObject({ ok: false, error: expect.stringContaining("já denunciou") })
    expect(await reports()).toHaveLength(1)
  })

  it("denunciar o anúncio e o dono dele são casos separados (um não conta como duplicata do outro)", async () => {
    holder.userId = "ana"
    expect((await reportListing({ productId, reason: REASON, description: DESC })).ok).toBe(true)
    expect((await reportUser({ targetUserId: "bia", reason: REASON, description: DESC })).ok).toBe(true)
  })
})

/* ---------------------------------------------------------------------------
 * claimReport
 * ------------------------------------------------------------------------ */

describe("claimReport", () => {
  it("só a moderação assume o caso", async () => {
    const id = await fileListingReport()
    for (const who of ["ana", "bia"]) {
      holder.userId = who
      expect(await claimReport(id), who).toEqual({ ok: false, error: "Acesso restrito à moderação." })
    }
    holder.userId = null
    expect(await claimReport(id)).toEqual({ ok: false, error: "Acesso restrito à moderação." })
    expect((await reportById(id)).status).toBe("aberta")
  })

  it("a moderação assume: vai para análise com o moderador registrado", async () => {
    const id = await fileListingReport()
    holder.userId = "mod"
    expect(await claimReport(id)).toMatchObject({ ok: true })
    expect(await reportById(id)).toMatchObject({ status: "em_analise", moderatorId: "mod" })
  })

  it("denúncia que não existe não vira 'atribuída'", async () => {
    holder.userId = "mod"
    expect(await claimReport(424_242)).toEqual({ ok: false, error: "Denúncia não encontrada." })
  })

  it("assumir um caso JÁ ENCERRADO não o reabre", async () => {
    const id = await fileListingReport()
    holder.userId = "mod"
    await resolveReport({ reportId: id, status: "arquivada", note: "Sem irregularidade." })

    const result = await claimReport(id)
    expect(result.ok).toBe(false)
    expect(await reportById(id)).toMatchObject({ status: "arquivada", resolutionNote: "Sem irregularidade." })
  })

  it("moderador que é parte do caso (denunciante, denunciado ou dono do anúncio) não o assume", async () => {
    // O moderador denuncia um anúncio.
    const reportedByMod = await fileListingReport("mod")
    // Denunciam o moderador.
    holder.userId = "ana"
    await reportUser({ targetUserId: "mod", reason: REASON, description: DESC })
    const againstMod = (await reports()).at(-1)!.id
    // Denunciam um anúncio do moderador.
    const modProduct = await addProduct("mod")
    const onModListing = await fileListingReport("cadu", modProduct)

    holder.userId = "mod"
    for (const id of [reportedByMod, againstMod, onModListing]) {
      expect((await claimReport(id)).ok, `caso ${id}`).toBe(false)
      expect((await reportById(id)).status).toBe("aberta")
    }

    holder.userId = "mod2" // outro moderador, sem conflito
    expect((await claimReport(againstMod)).ok).toBe(true)
  })
})

/* ---------------------------------------------------------------------------
 * resolveReport
 * ------------------------------------------------------------------------ */

describe("resolveReport", () => {
  it("só a moderação decide", async () => {
    const id = await fileListingReport()
    for (const who of ["ana", "bia"]) {
      holder.userId = who
      expect(await resolveReport({ reportId: id, status: "resolvida", note: "Decidido por mim mesmo." }), who).toEqual({ ok: false, error: "Acesso restrito à moderação." })
    }
    expect((await reportById(id)).status).toBe("aberta")
  })

  it("resolve ou arquiva, gravando nota, moderador e data", async () => {
    const a = await fileListingReport("ana")
    const b = await fileListingReport("cadu")
    holder.userId = "mod"

    expect(await resolveReport({ reportId: a, status: "resolvida", note: "  Anúncio com procedência falsa.  " })).toMatchObject({ ok: true })
    expect(await resolveReport({ reportId: b, status: "arquivada", note: "Nada de errado." })).toMatchObject({ ok: true })

    expect(await reportById(a)).toMatchObject({ status: "resolvida", resolutionNote: "Anúncio com procedência falsa.", moderatorId: "mod" })
    expect((await reportById(a)).resolvedAt).not.toBeNull()
    expect(await reportById(b)).toMatchObject({ status: "arquivada", moderatorId: "mod" })
  })

  it("exige uma nota de 5 a 1.000 caracteres", async () => {
    const id = await fileListingReport()
    holder.userId = "mod"
    expect(await resolveReport({ reportId: id, status: "resolvida", note: "curt" })).toMatchObject({ ok: false, field: "note" })
    expect(await resolveReport({ reportId: id, status: "resolvida", note: "n".repeat(MAX_REPORT_DESCRIPTION + 1) })).toMatchObject({ ok: false, field: "note" })
    expect((await reportById(id)).status).toBe("aberta")
    expect((await resolveReport({ reportId: id, status: "resolvida", note: "n".repeat(5) })).ok).toBe(true)
  })

  it("só aceita os dois desfechos válidos — o cliente não grava um status qualquer", async () => {
    const id = await fileListingReport()
    holder.userId = "mod"
    for (const bad of ["aberta", "em_analise", "lixo", "", "RESOLVIDA"]) {
      const result = await resolveReport({ reportId: id, status: bad as "resolvida", note: "Tentando outro status." })
      expect(result.ok, bad).toBe(false)
    }
    expect(await reportById(id)).toMatchObject({ status: "aberta", resolutionNote: null, resolvedAt: null })
  })

  it("denúncia inexistente e já encerrada", async () => {
    const id = await fileListingReport()
    holder.userId = "mod"
    expect(await resolveReport({ reportId: 424_242, status: "resolvida", note: "Não existe esta." })).toEqual({ ok: false, error: "Denúncia não encontrada." })

    await resolveReport({ reportId: id, status: "arquivada", note: "Primeira decisão." })
    expect(await resolveReport({ reportId: id, status: "resolvida", note: "Segunda decisão." })).toEqual({ ok: false, error: "Esta denúncia já foi encerrada." })
    expect(await reportById(id)).toMatchObject({ status: "arquivada", resolutionNote: "Primeira decisão." })
  })

  it("moderador que é parte do caso não decide a própria denúncia", async () => {
    holder.userId = "ana"
    await reportUser({ targetUserId: "mod", reason: REASON, description: DESC })
    const againstMod = (await reports()).at(-1)!.id
    const modProduct = await addProduct("mod")
    const onModListing = await fileListingReport("cadu", modProduct)
    const byMod = await fileListingReport("mod")

    holder.userId = "mod"
    for (const id of [againstMod, onModListing, byMod]) {
      const result = await resolveReport({ reportId: id, status: "arquivada", note: "Arquivo o caso sobre mim." })
      expect(result.ok, `caso ${id}`).toBe(false)
      expect((await reportById(id)).status).toBe("aberta")
    }

    holder.userId = "mod2"
    expect((await resolveReport({ reportId: againstMod, status: "resolvida", note: "Decisão de outro moderador." })).ok).toBe(true)
  })
})
