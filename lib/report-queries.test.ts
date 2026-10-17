import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/** Fila de denúncias da moderação: o que entra na fila, a ordem, o histórico paginado e a checagem de duplicata. */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
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

import {
  countReportsExcluding,
  findOpenReport,
  getReportDetail,
  getReportHistoryPage,
  getReportQueue,
} from "@/lib/report-queries"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

let productId: number

beforeEach(async () => {
  await t.query(`TRUNCATE "report", "product", "user" RESTART IDENTITY CASCADE`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('ana', 'Ana Maria da Silva', 'ana@teste.dev', 'AnaGames')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ('bia', 'Bia Souza', 'bia@teste.dev')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName") VALUES ('denunciante', 'Rita Santos Oliveira', 'rita@teste.dev', 'RitaDenuncia')`)
  await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ('outro', 'Outro', 'outro@teste.dev')`)
  const p = await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('ana', 'conta-suspeita', 'Conta suspeita', 'contas') RETURNING "id"`)
  productId = p.rows[0].id as number
})

async function addReport(
  opts: { reporter?: string; product?: number | null; user?: string | null; status?: string; createdAt?: string } = {},
) {
  const targetProduct = opts.product === undefined ? (opts.user ? null : productId) : opts.product
  const targetUser = opts.user ?? null
  const { rows } = await t.query(
    `INSERT INTO "report" ("reporterId", "targetType", "targetProductId", "targetUserId", "reason", "description", "status", "createdAt")
     VALUES ($1, $2, $3, $4, 'golpe', 'descrição', $5, COALESCE($6::timestamp, '2026-02-01 10:00:00')) RETURNING "id"`,
    [opts.reporter ?? "denunciante", targetUser ? "usuario" : "anuncio", targetProduct, targetUser, opts.status ?? "aberta", opts.createdAt ?? null],
  )
  return rows[0].id as number
}

describe("getReportQueue", () => {
  it("sem opções devolve tudo, mais recentes primeiro, desempate pelo id maior", async () => {
    const velha = await addReport({ createdAt: "2026-01-01 10:00:00" })
    const nova = await addReport({ createdAt: "2026-03-01 10:00:00" })
    const empateA = await addReport({ createdAt: "2026-02-01 10:00:00" })
    const empateB = await addReport({ createdAt: "2026-02-01 10:00:00" })
    expect((await getReportQueue()).map((r) => r.id)).toEqual([nova, empateB, empateA, velha])
  })

  it("statuses inclui, excludeStatuses exclui, lista vazia não filtra", async () => {
    const aberta = await addReport({ status: "aberta" })
    const analise = await addReport({ status: "em_analise" })
    const resolvida = await addReport({ status: "resolvida" })
    const arquivada = await addReport({ status: "arquivada" })
    const ids = async (o: Parameters<typeof getReportQueue>[0]) => (await getReportQueue(o)).map((r) => r.id).sort()
    expect(await ids({ statuses: ["aberta", "em_analise"] })).toEqual([aberta, analise].sort())
    expect(await ids({ excludeStatuses: ["aberta", "em_analise"] })).toEqual([resolvida, arquivada].sort())
    expect(await ids({ statuses: [] })).toHaveLength(4)
    expect(await ids({ statuses: ["aberta"], excludeStatuses: ["aberta"] })).toEqual([])
  })

  it("limit e offset paginam sem repetir nem pular", async () => {
    for (let i = 0; i < 5; i++) await addReport({ createdAt: `2026-02-0${i + 1} 10:00:00` })
    const todas = (await getReportQueue()).map((r) => r.id)
    const p1 = (await getReportQueue({ limit: 2 })).map((r) => r.id)
    const p2 = (await getReportQueue({ limit: 2, offset: 2 })).map((r) => r.id)
    const p3 = (await getReportQueue({ limit: 2, offset: 4 })).map((r) => r.id)
    expect([...p1, ...p2, ...p3]).toEqual(todas)
  })

  it("denúncia de anúncio traz o anúncio; de usuário traz o usuário; nomes públicos, nunca o legal", async () => {
    await addReport({ product: productId })
    await addReport({ user: "ana", product: null })
    await addReport({ user: "bia", product: null })
    const fila = await getReportQueue()
    const doAnuncio = fila.find((r) => r.targetType === "anuncio")!
    expect(doAnuncio).toMatchObject({ targetProductId: productId, targetProductTitle: "Conta suspeita", targetProductSlug: "conta-suspeita", targetUserId: null, targetUserName: null })
    const deAna = fila.find((r) => r.targetUserId === "ana")!
    expect(deAna).toMatchObject({ targetType: "usuario", targetUserName: "AnaGames", targetProductId: null, targetProductTitle: null })
    expect(fila.find((r) => r.targetUserId === "bia")!.targetUserName).toBe("Usuário BIA") // sem apelido: rótulo anônimo
    expect(fila.every((r) => r.reporterName === "RitaDenuncia")).toBe(true)
    expect(JSON.stringify(fila)).not.toContain("Rita Santos Oliveira")
    expect(JSON.stringify(fila)).not.toContain("Ana Maria da Silva")
  })
})

describe("getReportHistoryPage / countReportsExcluding", () => {
  it("histórico só tem as encerradas (resolvida/arquivada), mais recentes primeiro, com total", async () => {
    await addReport({ status: "aberta" })
    await addReport({ status: "em_analise" })
    const velha = await addReport({ status: "resolvida", createdAt: "2026-01-01 10:00:00" })
    const nova = await addReport({ status: "arquivada", createdAt: "2026-03-01 10:00:00" })
    const h = await getReportHistoryPage(1)
    expect(h.reports.map((r) => r.id)).toEqual([nova, velha])
    expect([h.total, h.page, h.pages]).toEqual([2, 1, 1])
  })

  it("pagina de 20 em 20 e página além do fim cai na última", async () => {
    for (let i = 0; i < 21; i++) await addReport({ status: "resolvida" })
    const p1 = await getReportHistoryPage(1)
    const alem = await getReportHistoryPage(99)
    expect([p1.total, p1.pages, p1.reports.length]).toEqual([21, 2, 20])
    expect([alem.page, alem.reports.length]).toEqual([2, 1])
    const ids = new Set([...p1.reports, ...(await getReportHistoryPage(2)).reports].map((r) => r.id))
    expect(ids.size).toBe(21)
  })

  it("countReportsExcluding conta fora dos status dados", async () => {
    await addReport({ status: "aberta" })
    await addReport({ status: "em_analise" })
    await addReport({ status: "resolvida" })
    expect(await countReportsExcluding(["aberta", "em_analise"])).toBe(1)
    expect(await countReportsExcluding(["inexistente"])).toBe(3)
    await t.query(`TRUNCATE "report"`)
    expect(await countReportsExcluding(["aberta"])).toBe(0)
  })
})

describe("getReportDetail", () => {
  it("devolve a denúncia com alvo e denunciante; nulo se não existe", async () => {
    const id = await addReport()
    expect(await getReportDetail(id)).toMatchObject({ id, reason: "golpe", description: "descrição", status: "aberta", reporterName: "RitaDenuncia", targetProductTitle: "Conta suspeita" })
    expect(await getReportDetail(999)).toBeNull()
  })
})

describe("findOpenReport", () => {
  it("acha denúncia ABERTA (aberta ou em análise) do mesmo denunciante contra o mesmo alvo", async () => {
    await addReport({ status: "aberta" })
    expect(await findOpenReport("denunciante", { productId })).toBe(true)
    await t.query(`UPDATE "report" SET "status" = 'em_analise'`)
    expect(await findOpenReport("denunciante", { productId })).toBe(true)
  })

  it("denúncia encerrada não bloqueia uma nova", async () => {
    await addReport({ status: "resolvida" })
    await addReport({ status: "arquivada" })
    expect(await findOpenReport("denunciante", { productId })).toBe(false)
  })

  it("outro denunciante ou outro alvo não conta", async () => {
    await addReport({ status: "aberta" })
    expect(await findOpenReport("outro", { productId })).toBe(false)
    expect(await findOpenReport("denunciante", { productId: productId + 1 })).toBe(false)
    expect(await findOpenReport("denunciante", { userId: "ana" })).toBe(false) // denúncia é de anúncio, não do usuário
  })

  it("denúncia contra usuário só casa com o mesmo usuário", async () => {
    await addReport({ user: "ana", product: null })
    expect(await findOpenReport("denunciante", { userId: "ana" })).toBe(true)
    expect(await findOpenReport("denunciante", { userId: "bia" })).toBe(false)
    expect(await findOpenReport("denunciante", { productId })).toBe(false)
  })
})
