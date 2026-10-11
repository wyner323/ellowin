import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Server actions da carteira (depósito de demonstração e saque Pix simulado)
 * contra um Postgres em memória com as migrações reais. A sessão e o cache do
 * Next são simulados; limitador de taxa, regras de conta, transação e extrato
 * são o código de verdade.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
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
      getSession: async () => (holder.userId ? { user: { id: holder.userId } } : null),
    },
  },
}))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/server", () => ({ after: () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

import { addFunds, requestWithdrawal } from "@/app/actions/wallet"
import { creditAvailable, moveToEscrow, withTransaction } from "@/lib/wallet"
import { runWalletReconciliation } from "@/lib/reconcile"

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
  await t.query(
    `TRUNCATE "auth_attempt", "wallet_transaction", "seller_application", "wallet", "profile", "user" RESTART IDENTITY CASCADE`,
  )
  await addUser("ana") // vendedora aprovada com Pix
  await addUser("bia") // comprador sem cadastro de vendedor
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

async function addUser(id: string, { emailVerified = true, profile = true } = {}) {
  await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES ($1, $1, $1 || '@teste.dev', $2)`, [
    id,
    emailVerified,
  ])
  if (profile) {
    await t.query(
      `INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "birthDate") VALUES ($1, $1, '52998224725', '11999999999', '1990-01-01')`,
      [id],
    )
  }
}

/** Torna o usuário um vendedor com Pix; `changedAgo` é uma expressão SQL (ex.: "interval '1 hour'") ou null. */
async function addSeller(userId: string, opts: { status?: string; pixKey?: string | null; changedAgo?: string | null } = {}) {
  const changedAgo = opts.changedAgo === undefined ? "interval '3 days'" : opts.changedAgo
  await t.query(
    `INSERT INTO "seller_application" ("userId", "status", "pixKeyType", "pixKey", "pixKeyChangedAt")
     VALUES ($1, $2, 'cpf', $3, ${changedAgo ? `now() - ${changedAgo}` : "NULL"})`,
    [userId, opts.status ?? "aprovado", opts.pixKey === undefined ? "52998224725" : opts.pixKey],
  )
}

async function fund(userId: string, cents: number) {
  await withTransaction((c) => creditAvailable(c, userId, cents, "deposito", "Saldo de teste"))
}

async function wallet(userId: string) {
  const { rows } = await t.query(`SELECT "availableCents", "heldCents" FROM "wallet" WHERE "userId" = $1`, [userId])
  return rows[0] as { availableCents: number; heldCents: number } | undefined
}

async function ledger(userId: string) {
  const { rows } = await t.query(
    `SELECT "kind", "amountCents", "balanceAfterCents", "description" FROM "wallet_transaction" WHERE "userId" = $1 ORDER BY "id"`,
    [userId],
  )
  return rows as { kind: string; amountCents: number; balanceAfterCents: number; description: string }[]
}

/* ---------------------------------------------------------------------------
 * addFunds
 * ------------------------------------------------------------------------ */

describe("addFunds", () => {
  it("credita o saldo e grava o depósito no extrato", async () => {
    holder.userId = "bia"
    const result = await addFunds("100,00")

    expect(result).toMatchObject({ ok: true })
    expect(result.message).toContain("100,00")
    expect(await wallet("bia")).toEqual({ availableCents: 10_000, heldCents: 0 })
    expect(await ledger("bia")).toEqual([
      { kind: "deposito", amountCents: 10_000, balanceAfterCents: 10_000, description: "Depósito na carteira" },
    ])
  })

  it("exige estar logado", async () => {
    holder.userId = null
    await expect(addFunds("100,00")).rejects.toThrow("Não autenticado")
  })

  it("aceita os limites exatos (R$ 5,00 e R$ 5.000,00) e recusa o que passa deles", async () => {
    holder.userId = "bia"
    expect((await addFunds("5,00")).ok).toBe(true)
    expect((await addFunds("5.000,00")).ok).toBe(true)

    expect(await addFunds("4,99")).toMatchObject({ ok: false, field: "amount" })
    expect((await wallet("bia"))?.availableCents).toBe(500 + 500_000)

    // O teto por depósito vale sozinho: usuário sem depósito nenhum, para o teto das 24h não mascarar.
    holder.userId = "ana"
    const result = await addFunds("5.000,01")
    expect(result).toMatchObject({ ok: false, field: "amount" })
    expect(result.error).toContain("5.000,00")
    expect(await wallet("ana")).toBeUndefined()
  })

  it("recusa valor inválido, zero e negativo sem creditar nada", async () => {
    holder.userId = "bia"
    for (const bad of ["", "abc", "0", "-50", "R$"]) {
      expect(await addFunds(bad), bad).toMatchObject({ ok: false, field: "amount" })
    }
    expect(await wallet("bia")).toBeUndefined()
  })

  it("o teto é de R$ 10.000 acumulados nas últimas 24h (dinheiro de mentira não vira saldo infinito)", async () => {
    holder.userId = "bia"
    expect((await addFunds("5.000,00")).ok).toBe(true)
    expect((await addFunds("5.000,00")).ok).toBe(true)

    const result = await addFunds("5,00")
    expect(result).toMatchObject({ ok: false, field: "amount" })
    expect(result.error).toContain("10.000,00")
    expect((await wallet("bia"))?.availableCents).toBe(1_000_000)
  })

  it("depósitos com mais de 24h não contam para o teto, e o teto é por usuário", async () => {
    holder.userId = "bia"
    await addFunds("5.000,00")
    await addFunds("5.000,00")
    // Envelhece os dois depósitos para 25h atrás.
    await t.query(`UPDATE "wallet_transaction" SET "createdAt" = now() - interval '25 hours' WHERE "userId" = 'bia'`)
    expect((await addFunds("5.000,00")).ok).toBe(true)

    holder.userId = "ana"
    expect((await addFunds("5.000,00")).ok).toBe(true)
  })

  it("limita a frequência: no máximo 10 depósitos por hora", async () => {
    holder.userId = "bia"
    for (let i = 0; i < 10; i++) expect((await addFunds("5,00")).ok, `depósito ${i + 1}`).toBe(true)

    const result = await addFunds("5,00")
    expect(result).toMatchObject({ ok: false, field: "amount" })
    expect(result.error).toContain("Muitos depósitos")
    expect((await wallet("bia"))?.availableCents).toBe(10 * 500)
  })
})

/* ---------------------------------------------------------------------------
 * requestWithdrawal
 * ------------------------------------------------------------------------ */

describe("requestWithdrawal", () => {
  it("debita o saldo disponível e registra o saque (simulado) no extrato", async () => {
    await addSeller("ana")
    await fund("ana", 50_000)
    holder.userId = "ana"

    const result = await requestWithdrawal("200,00")

    expect(result).toMatchObject({ ok: true })
    expect(result.message).toContain("simulado")
    expect(await wallet("ana")).toEqual({ availableCents: 30_000, heldCents: 0 })
    const last = (await ledger("ana")).at(-1)!
    expect(last).toMatchObject({ kind: "saque", amountCents: -20_000, balanceAfterCents: 30_000 })
  })

  it("exige estar logado", async () => {
    holder.userId = null
    await expect(requestWithdrawal("50,00")).rejects.toThrow("Não autenticado")
  })

  it("o saque mínimo é R$ 10,00 e valores inválidos são recusados", async () => {
    await addSeller("ana")
    await fund("ana", 50_000)
    holder.userId = "ana"

    for (const bad of ["9,99", "0", "-20", "abc", ""]) {
      expect(await requestWithdrawal(bad), bad).toMatchObject({ ok: false, field: "amount" })
    }
    expect((await requestWithdrawal("10,00")).ok).toBe(true)
    expect((await wallet("ana"))?.availableCents).toBe(49_000)
  })

  it("exige e-mail confirmado e cadastro completo", async () => {
    await addUser("sem-email", { emailVerified: false })
    await addUser("sem-perfil", { profile: false })
    for (const id of ["sem-email", "sem-perfil"]) {
      await addSeller(id)
      await fund(id, 50_000)
    }

    holder.userId = "sem-email"
    expect(await requestWithdrawal("50,00")).toMatchObject({ ok: false, field: "email" })
    holder.userId = "sem-perfil"
    expect(await requestWithdrawal("50,00")).toMatchObject({ ok: false, field: "profile" })

    expect((await wallet("sem-email"))?.availableCents).toBe(50_000)
    expect((await wallet("sem-perfil"))?.availableCents).toBe(50_000)
  })

  it("só vendedor aprovado com Pix cadastrado saca", async () => {
    await fund("bia", 50_000)
    holder.userId = "bia"
    expect(await requestWithdrawal("50,00")).toMatchObject({ ok: false })

    await addUser("pendente")
    await addSeller("pendente", { status: "em_andamento" })
    await fund("pendente", 50_000)
    holder.userId = "pendente"
    expect(await requestWithdrawal("50,00")).toMatchObject({ ok: false })

    await addUser("sem-pix")
    await addSeller("sem-pix", { pixKey: null })
    await fund("sem-pix", 50_000)
    holder.userId = "sem-pix"
    expect(await requestWithdrawal("50,00")).toMatchObject({ ok: false })

    for (const id of ["bia", "pendente", "sem-pix"]) expect((await wallet(id))?.availableCents).toBe(50_000)
  })

  it("trocar a chave Pix bloqueia o saque por 24h (defesa contra sessão roubada)", async () => {
    await addSeller("ana", { changedAgo: "interval '1 hour'" })
    await fund("ana", 50_000)
    holder.userId = "ana"

    const blocked = await requestWithdrawal("50,00")
    expect(blocked).toMatchObject({ ok: false })
    expect(blocked.error).toContain("24 horas")
    expect((await wallet("ana"))?.availableCents).toBe(50_000)

    // Passadas as 24h, libera.
    await t.query(`UPDATE "seller_application" SET "pixKeyChangedAt" = now() - interval '25 hours' WHERE "userId" = 'ana'`)
    expect((await requestWithdrawal("50,00")).ok).toBe(true)
  })

  it("chave que nunca mudou (sem data) não bloqueia", async () => {
    await addSeller("ana", { changedAgo: null })
    await fund("ana", 50_000)
    holder.userId = "ana"
    expect((await requestWithdrawal("50,00")).ok).toBe(true)
  })

  it("saldo insuficiente: recusa e não deixa o saldo negativo", async () => {
    await addSeller("ana")
    await fund("ana", 5_000)
    holder.userId = "ana"

    const result = await requestWithdrawal("50,01")
    expect(result).toMatchObject({ ok: false, field: "amount", error: "Saldo disponível insuficiente." })
    expect(await wallet("ana")).toEqual({ availableCents: 5_000, heldCents: 0 })
    expect(await ledger("ana")).toHaveLength(1)
  })

  it("não saca o que está em custódia (só o saldo disponível)", async () => {
    await addSeller("ana")
    await fund("ana", 50_000)
    // R$ 450 vão para custódia numa compra; sobram R$ 50 disponíveis.
    await withTransaction((c) => moveToEscrow(c, "ana", 45_000, "Compra de teste"))
    holder.userId = "ana"

    expect((await requestWithdrawal("100,00")).ok).toBe(false)
    expect((await requestWithdrawal("50,00")).ok).toBe(true)
    expect(await wallet("ana")).toEqual({ availableCents: 0, heldCents: 45_000 })
  })

  it("dois saques que juntos passam do saldo: o segundo é recusado", async () => {
    await addSeller("ana")
    await fund("ana", 10_000)
    holder.userId = "ana"

    expect((await requestWithdrawal("70,00")).ok).toBe(true)
    expect((await requestWithdrawal("70,00")).ok).toBe(false)
    expect(await wallet("ana")).toEqual({ availableCents: 3_000, heldCents: 0 })
  })

  it("limita a frequência: no máximo 5 pedidos de saque por hora", async () => {
    await addSeller("ana")
    await fund("ana", 100_000)
    holder.userId = "ana"

    for (let i = 0; i < 5; i++) expect((await requestWithdrawal("10,00")).ok, `saque ${i + 1}`).toBe(true)
    const result = await requestWithdrawal("10,00")
    expect(result).toMatchObject({ ok: false, field: "amount" })
    expect(result.error).toContain("Muitos pedidos de saque")
    expect((await wallet("ana"))?.availableCents).toBe(100_000 - 5 * 1_000)
  })

  it("um saque de um usuário não mexe na carteira de outro", async () => {
    await addSeller("ana")
    await fund("ana", 50_000)
    await fund("bia", 50_000)
    holder.userId = "ana"
    await requestWithdrawal("100,00")

    expect(await wallet("bia")).toEqual({ availableCents: 50_000, heldCents: 0 })
  })
})

describe("conferência do dinheiro depois de depósitos e saques", () => {
  it("o que entrou menos o que saiu bate com os saldos", async () => {
    await addSeller("ana")
    holder.userId = "ana"
    await addFunds("1.000,00")
    await requestWithdrawal("250,00")
    await requestWithdrawal("1,00") // recusado (abaixo do mínimo)
    await requestWithdrawal("5.000,00") // recusado (saldo)
    holder.userId = "bia"
    await addFunds("20,00")

    const report = await runWalletReconciliation()
    expect(report.findings).toEqual([])
    expect(await wallet("ana")).toEqual({ availableCents: 75_000, heldCents: 0 })
  })
})
