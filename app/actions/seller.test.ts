import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Cadastro de vendedor (loja → telefone → documento → Pix) contra um Postgres em
 * memória com as migrações reais. O que importa aqui é que as etapas do
 * assistente NÃO são só interface: o servidor confere, a cada passo, que as
 * anteriores foram feitas, e que ninguém vira vendedor aprovado pulando etapas.
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

import { advanceContactStep, saveKycStep, savePayoutStep, saveStoreStep } from "@/app/actions/seller"
import { requestWithdrawal } from "@/app/actions/wallet"
import { creditAvailable, withTransaction } from "@/lib/wallet"

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
  await t.query(`TRUNCATE "auth_attempt", "wallet_transaction", "wallet", "seller_application", "profile", "user" RESTART IDENTITY CASCADE`)
  await addUser("ana")
  await addUser("bia")
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

const CPF = "52998224725"

async function addUser(id: string, opts: { emailVerified?: boolean; phoneVerified?: boolean; profile?: boolean; cpf?: string } = {}) {
  await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES ($1, $1, $1 || '@teste.dev', $2)`, [id, opts.emailVerified ?? true])
  if (opts.profile !== false) {
    await t.query(
      `INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "phoneVerified", "birthDate") VALUES ($1, $1, $2, '11999991111', $3, '01/01/1990')`,
      [id, opts.cpf ?? CPF, opts.phoneVerified ?? true],
    )
  }
}

async function rows(text: string, params?: unknown[]) {
  return (await t.query(text, params)).rows
}

type App = {
  userId: string
  storeName: string | null
  storeSlug: string | null
  category: string | null
  description: string | null
  documentType: string | null
  documentNumber: string | null
  documentFrontName: string | null
  selfieName: string | null
  pixKeyType: string | null
  pixKey: string | null
  pixKeyChangedAt: Date | null
  bankHolder: string | null
  acceptedTerms: boolean
  currentStep: number
  level: number
  status: string
}

const appOf = async (userId: string) => (await rows(`SELECT * FROM "seller_application" WHERE "userId" = $1`, [userId]))[0] as App | undefined

const STORE = { storeName: "Loja do Ana Games", category: "contas", description: "Vendo contas de jogos com entrega rápida e suporte no chat do pedido." }
const KYC = { documentType: "cpf", documentNumber: "529.982.247-25", documentFrontName: "frente.jpg", selfieName: "selfie.jpg" }
const PIX = { pixKeyType: "cpf", pixKey: "529.982.247-25", bankHolder: "Ana Souza", acceptedTerms: true }

/** Cadastro completo até o fim, pelas próprias ações. */
async function becomeSeller(userId = "ana") {
  holder.userId = userId
  expect((await saveStoreStep(STORE)).ok).toBe(true)
  expect((await saveKycStep(KYC)).ok).toBe(true)
  const result = await savePayoutStep(PIX)
  expect(result.ok, result.error).toBe(true)
}

/* ---------------------------------------------------------------------------
 * Etapa 1: loja
 * ------------------------------------------------------------------------ */

describe("saveStoreStep", () => {
  it("exige estar logado", async () => {
    await expect(saveStoreStep(STORE)).rejects.toThrow("Não autenticado")
  })

  it("cria a candidatura em andamento, na etapa 2, com slug da loja", async () => {
    holder.userId = "ana"
    expect(await saveStoreStep({ ...STORE, storeName: "  Loja do Açaí & Cia!  ", description: `  ${STORE.description}  ` })).toMatchObject({ ok: true })

    const a = (await appOf("ana"))!
    expect(a).toMatchObject({
      storeName: "Loja do Açaí & Cia!",
      storeSlug: "loja-do-acai-cia",
      category: "contas",
      description: STORE.description,
      currentStep: 2,
      status: "em_andamento",
    })
  })

  const bad: [string, Partial<typeof STORE>, string][] = [
    ["nome curto", { storeName: "ab" }, "storeName"],
    ["nome só com espaços", { storeName: "     " }, "storeName"],
    ["nome longo", { storeName: "n".repeat(61) }, "storeName"],
    ["sem categoria", { category: "" }, "category"],
    ["categoria enorme", { category: "c".repeat(41) }, "category"],
    ["descrição curta", { description: "curta demais" }, "description"],
    ["descrição longa", { description: "d".repeat(1_001) }, "description"],
  ]
  it.each(bad)("recusa %s e não cria nada", async (_name, over, field) => {
    holder.userId = "ana"
    expect(await saveStoreStep({ ...STORE, ...over })).toMatchObject({ ok: false, field })
    expect(await appOf("ana")).toBeUndefined()
  })

  it("o slug nunca repete (sem diferenciar maiúsculas) e reaplicar o mesmo nome não muda o slug", async () => {
    holder.userId = "ana"
    await saveStoreStep(STORE)
    const first = (await appOf("ana"))!.storeSlug

    holder.userId = "bia"
    await saveStoreStep({ ...STORE, storeName: STORE.storeName.toUpperCase() })
    expect((await appOf("bia"))!.storeSlug).toBe(`${first}-2`)

    holder.userId = "ana"
    await saveStoreStep(STORE)
    expect((await appOf("ana"))!.storeSlug).toBe(first)
  })

  it("nome só de símbolos vira 'loja' e a segunda também ganha sufixo", async () => {
    holder.userId = "ana"
    await saveStoreStep({ ...STORE, storeName: "!!!" })
    holder.userId = "bia"
    await saveStoreStep({ ...STORE, storeName: "???" })
    expect((await appOf("ana"))!.storeSlug).toBe("loja")
    expect((await appOf("bia"))!.storeSlug).toBe("loja-2")
  })

  it("editar a loja de quem JÁ é aprovado não o devolve para 'em andamento'", async () => {
    await becomeSeller("ana")
    const before = (await appOf("ana"))!

    holder.userId = "ana"
    expect(await saveStoreStep({ ...STORE, description: "Descrição nova da loja, com bem mais de trinta caracteres." })).toMatchObject({ ok: true })

    const after = (await appOf("ana"))!
    expect(after).toMatchObject({ status: "aprovado", currentStep: before.currentStep, level: before.level })
    expect(after.description).toContain("Descrição nova")
  })

  it("só mexe na candidatura de quem está logado", async () => {
    await becomeSeller("bia")
    const bia = await appOf("bia")
    holder.userId = "ana"
    await saveStoreStep({ ...STORE, storeName: "Outra loja da Ana" })
    expect(await appOf("bia")).toEqual(bia)
  })
})

/* ---------------------------------------------------------------------------
 * advanceContactStep
 * ------------------------------------------------------------------------ */

describe("advanceContactStep", () => {
  it("recusa etapa inválida e exige estar logado", async () => {
    holder.userId = "ana"
    for (const bad of [0, 7, -1, 1.5, Number.NaN]) {
      expect(await advanceContactStep(bad), String(bad)).toEqual({ ok: false, error: "Etapa inválida." })
    }
    expect(await appOf("ana")).toBeUndefined()

    holder.userId = null
    await expect(advanceContactStep(2)).rejects.toThrow("Não autenticado")
  })

  it("registra o avanço e o nível (1 até a etapa 3, 2 a partir da 4)", async () => {
    holder.userId = "ana"
    await advanceContactStep(3)
    expect(await appOf("ana")).toMatchObject({ currentStep: 3, level: 1 })
    await advanceContactStep(4)
    expect(await appOf("ana")).toMatchObject({ currentStep: 4, level: 2 })
  })

  it("passar do telefone exige o telefone realmente confirmado", async () => {
    await addUser("sem-tel", { phoneVerified: false })
    holder.userId = "sem-tel"
    expect(await advanceContactStep(4)).toMatchObject({ ok: false })
    expect(await advanceContactStep(5)).toMatchObject({ ok: false })
    expect(await appOf("sem-tel")).toBeUndefined()
    expect((await advanceContactStep(3)).ok).toBe(true)
  })

  it("nunca aprova ninguém e não mexe em vendedor já aprovado", async () => {
    holder.userId = "ana"
    await advanceContactStep(6)
    expect((await appOf("ana"))!.status).toBe("em_andamento")

    await becomeSeller("bia")
    const before = await appOf("bia")
    holder.userId = "bia"
    expect(await advanceContactStep(1)).toEqual({ ok: true })
    expect(await appOf("bia")).toEqual(before)
  })
})

/* ---------------------------------------------------------------------------
 * Etapa 4: documento
 * ------------------------------------------------------------------------ */

describe("saveKycStep", () => {
  it("exige estar logado", async () => {
    holder.userId = null
    await expect(saveKycStep(KYC)).rejects.toThrow("Não autenticado")
  })

  it("exige loja cadastrada E telefone confirmado antes", async () => {
    holder.userId = "ana"
    const semLoja = await saveKycStep(KYC)
    expect(semLoja).toMatchObject({ ok: false })
    expect(semLoja.error).toContain("etapas anteriores")

    await addUser("sem-tel", { phoneVerified: false })
    holder.userId = "sem-tel"
    await saveStoreStep(STORE)
    expect(await saveKycStep(KYC)).toMatchObject({ ok: false, error: expect.stringContaining("etapas anteriores") })
    expect((await appOf("sem-tel"))!.documentNumber).toBeNull()
  })

  it("grava só os dígitos, passa para a etapa 5 (nível 3) e NÃO aprova", async () => {
    holder.userId = "ana"
    await saveStoreStep(STORE)

    expect(await saveKycStep(KYC)).toMatchObject({ ok: true })
    expect(await appOf("ana")).toMatchObject({
      documentType: "cpf",
      documentNumber: "52998224725",
      documentFrontName: "frente.jpg",
      selfieName: "selfie.jpg",
      currentStep: 5,
      level: 3,
      status: "em_andamento",
    })
  })

  const bad: [string, Partial<typeof KYC>, string][] = [
    ["sem tipo de documento", { documentType: "" }, "documentType"],
    ["tipo de documento fora da lista", { documentType: "passaporte-falso" }, "documentType"],
    ["CPF com dígito errado", { documentNumber: "529.982.247-26" }, "documentNumber"],
    ["CPF de outra pessoa (válido, mas diferente do da conta)", { documentNumber: "111.444.777-35" }, "documentNumber"],
    ["CNH com 10 dígitos", { documentType: "cnh", documentNumber: "1234567890" }, "documentNumber"],
    ["RG curto", { documentType: "rg", documentNumber: "12345" }, "documentNumber"],
    ["RG sem número nenhum", { documentType: "rg", documentNumber: "abc" }, "documentNumber"],
    ["sem a frente do documento", { documentFrontName: "" }, "documentFrontName"],
    ["sem a selfie", { selfieName: "" }, "selfieName"],
  ]
  it.each(bad)("recusa %s e não grava nada", async (_name, over, field) => {
    holder.userId = "ana"
    await saveStoreStep(STORE)
    expect(await saveKycStep({ ...KYC, ...over })).toMatchObject({ ok: false, field })
    expect((await appOf("ana"))!.documentNumber).toBeNull()
  })

  it("aceita CNH de 11 dígitos e RG de 7 ou mais", async () => {
    holder.userId = "ana"
    await saveStoreStep(STORE)
    expect((await saveKycStep({ ...KYC, documentType: "cnh", documentNumber: "12345678901" })).ok).toBe(true)
    expect((await saveKycStep({ ...KYC, documentType: "rg", documentNumber: "12.345.678-9" })).ok).toBe(true)
  })

  it("nome de arquivo com mais de 200 caracteres é recusado", async () => {
    holder.userId = "ana"
    await saveStoreStep(STORE)
    expect(await saveKycStep({ ...KYC, documentFrontName: "f".repeat(201) })).toMatchObject({ ok: false })
    expect(await saveKycStep({ ...KYC, selfieName: "s".repeat(201) })).toMatchObject({ ok: false })
  })

  it("não rebaixa vendedor já aprovado", async () => {
    await becomeSeller("ana")
    holder.userId = "ana"
    expect((await saveKycStep({ ...KYC, documentFrontName: "nova-frente.jpg" })).ok).toBe(true)
    expect(await appOf("ana")).toMatchObject({ status: "aprovado", level: 4, currentStep: 6, documentFrontName: "nova-frente.jpg" })
  })
})

/* ---------------------------------------------------------------------------
 * Etapa 5: Pix (aprova o vendedor)
 * ------------------------------------------------------------------------ */

async function readyForPayout(userId = "ana") {
  holder.userId = userId
  await saveStoreStep(STORE)
  await saveKycStep(KYC)
}

describe("savePayoutStep", () => {
  it("exige estar logado", async () => {
    holder.userId = null
    await expect(savePayoutStep(PIX)).rejects.toThrow("Não autenticado")
  })

  it("só aprova com e-mail confirmado e cadastro completo", async () => {
    await addUser("sem-email", { emailVerified: false })
    await addUser("sem-perfil", { profile: false })

    holder.userId = "sem-email"
    expect(await savePayoutStep(PIX)).toMatchObject({ ok: false, field: "email" })
    holder.userId = "sem-perfil"
    expect(await savePayoutStep(PIX)).toMatchObject({ ok: false, field: "profile" })
    expect(await appOf("sem-email")).toBeUndefined()
    expect(await appOf("sem-perfil")).toBeUndefined()
  })

  it("não dá para virar vendedor pulando etapas, chamando este passo direto", async () => {
    holder.userId = "ana"
    expect(await savePayoutStep(PIX)).toMatchObject({ ok: false, error: expect.stringContaining("etapas anteriores") })
    expect(await appOf("ana")).toBeUndefined()

    // Com loja e documento, mas telefone NÃO confirmado.
    await addUser("sem-tel", { phoneVerified: false })
    holder.userId = "sem-tel"
    await saveStoreStep(STORE)
    // O passo do documento também exige telefone; força o documento direto no banco para isolar a checagem deste passo.
    await t.query(`UPDATE "seller_application" SET "documentNumber" = '52998224725' WHERE "userId" = 'sem-tel'`)
    expect(await savePayoutStep(PIX)).toMatchObject({ ok: false, error: expect.stringContaining("etapas anteriores") })
    expect((await appOf("sem-tel"))!.status).toBe("em_andamento")

    // Com loja e telefone, mas SEM documento.
    await addUser("sem-doc")
    holder.userId = "sem-doc"
    await saveStoreStep(STORE)
    expect(await savePayoutStep(PIX)).toMatchObject({ ok: false, error: expect.stringContaining("etapas anteriores") })

    // Telefone e documento, mas SEM loja.
    await addUser("sem-loja")
    await t.query(`INSERT INTO "seller_application" ("userId", "documentNumber") VALUES ('sem-loja', '52998224725')`)
    holder.userId = "sem-loja"
    expect(await savePayoutStep(PIX)).toMatchObject({ ok: false, error: expect.stringContaining("etapas anteriores") })
  })

  it("com tudo em ordem aprova: nível 4, etapa 6, chave Pix só com dígitos (CPF)", async () => {
    await readyForPayout()
    expect(await savePayoutStep(PIX)).toMatchObject({ ok: true, message: "Cadastro de vendedor concluído." })

    expect(await appOf("ana")).toMatchObject({
      status: "aprovado",
      level: 4,
      currentStep: 6,
      pixKeyType: "cpf",
      pixKey: "52998224725",
      bankHolder: "Ana Souza",
      acceptedTerms: true,
    })
  })

  const bad: [string, Partial<typeof PIX>, string][] = [
    ["sem tipo de chave", { pixKeyType: "" }, "pixKeyType"],
    ["tipo de chave fora da lista", { pixKeyType: "boleto", pixKey: "qualquer-coisa" }, "pixKeyType"],
    ["chave CPF inválida", { pixKey: "123.456.789-00" }, "pixKey"],
    ["chave e-mail inválida", { pixKeyType: "email", pixKey: "isso-nao-e-email" }, "pixKey"],
    ["chave telefone com 10 dígitos", { pixKeyType: "telefone", pixKey: "(11) 3999-1111" }, "pixKey"],
    ["chave aleatória curta", { pixKeyType: "aleatoria", pixKey: "abc123" }, "pixKey"],
    ["titular curto", { bankHolder: "ab" }, "bankHolder"],
    ["sem aceitar os termos", { acceptedTerms: false }, "acceptedTerms"],
  ]
  it.each(bad)("recusa %s e não aprova", async (_name, over, field) => {
    await readyForPayout()
    expect(await savePayoutStep({ ...PIX, ...over })).toMatchObject({ ok: false, field })
    expect((await appOf("ana"))!.status).toBe("em_andamento")
    expect((await appOf("ana"))!.pixKey).toBeNull()
  })

  it("titular ou chave longos demais são recusados", async () => {
    await readyForPayout()
    expect(await savePayoutStep({ ...PIX, bankHolder: "h".repeat(101) })).toMatchObject({ ok: false })
    expect(await savePayoutStep({ ...PIX, pixKeyType: "aleatoria", pixKey: "k".repeat(141) })).toMatchObject({ ok: false })
    expect((await appOf("ana"))!.status).toBe("em_andamento")
  })

  it("aceita cada tipo de chave válido", async () => {
    await readyForPayout()
    for (const [pixKeyType, pixKey] of [
      ["email", "ana@teste.dev"],
      ["telefone", "(11) 99999-1111"],
      ["aleatoria", "123e4567-e89b-12d3-a456-426614174000"],
      ["cpf", "529.982.247-25"],
    ] as const) {
      expect((await savePayoutStep({ ...PIX, pixKeyType, pixKey })).ok, pixKeyType).toBe(true)
    }
  })

  it("a data da troca da chave é gravada na primeira vez e a cada mudança, mas não quando a mesma chave é reenviada", async () => {
    await readyForPayout()
    await savePayoutStep(PIX)
    const first = (await appOf("ana"))!.pixKeyChangedAt
    expect(first).not.toBeNull()

    // Mesma chave: a data não anda.
    await t.query(`UPDATE "seller_application" SET "pixKeyChangedAt" = now() - interval '5 days' WHERE "userId" = 'ana'`)
    const old = (await appOf("ana"))!.pixKeyChangedAt!
    await savePayoutStep({ ...PIX, bankHolder: "Ana S. Souza" })
    expect((await appOf("ana"))!.pixKeyChangedAt!.getTime()).toBe(old.getTime())

    // Chave nova: a data volta para agora.
    await savePayoutStep({ ...PIX, pixKeyType: "email", pixKey: "ana@teste.dev" })
    const changed = (await appOf("ana"))!.pixKeyChangedAt!
    expect(changed.getTime()).toBeGreaterThan(old.getTime())
  })

  it("trocar a chave Pix trava o saque por 24h (defesa contra sessão roubada)", async () => {
    await becomeSeller("ana")
    await t.query(`UPDATE "seller_application" SET "pixKeyChangedAt" = now() - interval '3 days' WHERE "userId" = 'ana'`)
    holder.userId = "ana"
    await withTransaction((c) => creditAvailable(c, "ana", 50_000, "deposito", "Saldo de teste"))
    expect((await requestWithdrawal("100,00")).ok).toBe(true)

    await savePayoutStep({ ...PIX, pixKeyType: "email", pixKey: "ladrao@teste.dev" })

    const blocked = await requestWithdrawal("100,00")
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toContain("24 horas")
  })

  it("vendedor já aprovado que só troca a chave NÃO perde o nível conquistado", async () => {
    await becomeSeller("ana")
    await t.query(`UPDATE "seller_application" SET "level" = 5 WHERE "userId" = 'ana'`)

    holder.userId = "ana"
    expect((await savePayoutStep({ ...PIX, pixKeyType: "email", pixKey: "nova@teste.dev" })).ok).toBe(true)
    expect(await appOf("ana")).toMatchObject({ status: "aprovado", level: 5, pixKey: "nova@teste.dev" })
  })

  it("só mexe na candidatura de quem está logado", async () => {
    await becomeSeller("bia")
    const bia = await appOf("bia")
    await readyForPayout("ana")
    holder.userId = "ana"
    await savePayoutStep({ ...PIX, pixKeyType: "email", pixKey: "ana@teste.dev" })
    expect(await appOf("bia")).toEqual(bia)
  })
})

describe("o cadastro inteiro", () => {
  it("quem faz tudo na ordem vira vendedor aprovado, e só ele", async () => {
    await becomeSeller("ana")
    expect(await appOf("ana")).toMatchObject({ status: "aprovado", level: 4 })
    expect(await appOf("bia")).toBeUndefined()
  })
})
