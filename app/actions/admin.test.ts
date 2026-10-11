import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Painel de administração (cargos e busca de usuários) e o bootstrap do primeiro
 * administrador por e-mail, contra um Postgres em memória com as migrações reais.
 * O cargo libera o histórico completo das disputas, então promoção é restrita.
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
      getSession: async () => {
        if (!holder.userId) return null
        const { rows } = await holder.pool.query(`SELECT "id", "email", "emailVerified" FROM "user" WHERE "id" = $1`, [holder.userId])
        return rows[0] ? { user: rows[0] } : null
      },
    },
  },
}))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/server", () => ({ after: () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

import { searchUsers, setUserRole } from "@/app/actions/admin"
import { getCurrentStaff, getStaff, isStaffRole, requireAdmin, requireStaff } from "@/lib/roles"

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
  vi.unstubAllEnvs()
  await t.query(`TRUNCATE "user" RESTART IDENTITY CASCADE`)
  await addUser("adm", { role: "admin" })
  await addUser("adm2", { role: "admin" })
  await addUser("mod", { role: "moderator" })
  await addUser("ana", { name: "Ana Souza", email: "ana@teste.dev" })
  await addUser("bia", { name: "Bia Lima", email: "bia@teste.dev" })
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

async function addUser(id: string, opts: { role?: string; name?: string; email?: string; emailVerified?: boolean } = {}) {
  await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified", "role") VALUES ($1, $2, $3, $4, $5)`, [
    id,
    opts.name ?? id,
    opts.email ?? `${id}@teste.dev`,
    opts.emailVerified ?? true,
    opts.role ?? "user",
  ])
}

const roleOf = async (id: string) => ((await t.query(`SELECT "role" FROM "user" WHERE "id" = $1`, [id])).rows[0] as { role: string }).role

/* ---------------------------------------------------------------------------
 * setUserRole
 * ------------------------------------------------------------------------ */

describe("setUserRole", () => {
  it("o administrador promove e rebaixa outras pessoas", async () => {
    holder.userId = "adm"
    expect(await setUserRole({ userId: "ana", role: "moderator" })).toMatchObject({ ok: true })
    expect(await roleOf("ana")).toBe("moderator")
    expect((await setUserRole({ userId: "ana", role: "admin" })).ok).toBe(true)
    expect(await roleOf("ana")).toBe("admin")
    expect((await setUserRole({ userId: "mod", role: "user" })).ok).toBe(true)
    expect(await roleOf("mod")).toBe("user")
  })

  it("só administrador altera cargo: moderador e usuário comum são barrados (nem moderador promove alguém)", async () => {
    for (const who of ["mod", "ana"]) {
      holder.userId = who
      await expect(setUserRole({ userId: "bia", role: "admin" }), who).rejects.toThrow("Acesso restrito a administradores")
    }
    holder.userId = null
    await expect(setUserRole({ userId: "bia", role: "admin" })).rejects.toThrow()
    expect(await roleOf("bia")).toBe("user")
  })

  it("não aceita cargo inventado, nem de forma disfarçada", async () => {
    holder.userId = "adm"
    for (const bad of ["superadmin", "ADMIN", "", "root", "admin ", "user; drop table"]) {
      expect(await setUserRole({ userId: "ana", role: bad }), bad).toEqual({ ok: false, error: "Cargo inválido." })
    }
    expect(await roleOf("ana")).toBe("user")
  })

  it("o administrador não tira o próprio acesso (a plataforma nunca fica sem admin por engano)", async () => {
    holder.userId = "adm"
    for (const role of ["user", "moderator"]) {
      expect(await setUserRole({ userId: "adm", role }), role).toMatchObject({ ok: false, error: expect.stringContaining("próprio acesso") })
    }
    expect(await roleOf("adm")).toBe("admin")
    expect((await setUserRole({ userId: "adm", role: "admin" })).ok).toBe(true)
  })

  it("pode rebaixar OUTRO administrador", async () => {
    holder.userId = "adm"
    expect((await setUserRole({ userId: "adm2", role: "user" })).ok).toBe(true)
    expect(await roleOf("adm2")).toBe("user")
  })

  it("usuário que não existe não vira 'cargo atualizado'", async () => {
    holder.userId = "adm"
    expect(await setUserRole({ userId: "fantasma", role: "moderator" })).toEqual({ ok: false, error: "Usuário não encontrado." })
  })

  it("só muda a pessoa indicada", async () => {
    holder.userId = "adm"
    await setUserRole({ userId: "ana", role: "moderator" })
    expect(await roleOf("bia")).toBe("user")
    expect(await roleOf("mod")).toBe("moderator")
  })
})

/* ---------------------------------------------------------------------------
 * searchUsers
 * ------------------------------------------------------------------------ */

describe("searchUsers", () => {
  it("só administrador busca", async () => {
    for (const who of ["mod", "ana"]) {
      holder.userId = who
      await expect(searchUsers("ana"), who).rejects.toThrow("Acesso restrito a administradores")
    }
    holder.userId = null
    await expect(searchUsers("ana")).rejects.toThrow()
  })

  it("acha por nome ou por e-mail, sem diferenciar maiúsculas, e devolve só o necessário", async () => {
    holder.userId = "adm"
    const byName = await searchUsers("souza")
    expect(byName.map((u) => u.id)).toEqual(["ana"])
    expect(Object.keys(byName[0]).sort()).toEqual(["createdAt", "email", "id", "name", "role"])

    expect((await searchUsers("BIA@TESTE")).map((u) => u.id)).toEqual(["bia"])
    expect((await searchUsers("  lima  ")).map((u) => u.id)).toEqual(["bia"])
  })

  it("% e _ valem como texto, não como curinga", async () => {
    holder.userId = "adm"
    expect(await searchUsers("%")).toEqual([])
    expect(await searchUsers("_")).toEqual([])
    await addUser("pct", { name: "100% Gamer", email: "pct@teste.dev" })
    expect((await searchUsers("100%")).map((u) => u.id)).toEqual(["pct"])
  })

  it("sem termo lista até 30; com muitos resultados também corta em 30", async () => {
    for (let i = 0; i < 40; i++) await addUser(`extra${i}`, { name: `Extra ${i}`, email: `extra${i}@teste.dev` })
    holder.userId = "adm"
    expect(await searchUsers("")).toHaveLength(30)
    expect(await searchUsers("   ")).toHaveLength(30)
    expect(await searchUsers("extra")).toHaveLength(30)
  })

  it("termo gigante é cortado e não quebra", async () => {
    holder.userId = "adm"
    await expect(searchUsers("a".repeat(10_000))).resolves.toEqual([])
  })
})

/* ---------------------------------------------------------------------------
 * lib/roles: cargo da sessão e o primeiro administrador
 * ------------------------------------------------------------------------ */

describe("getCurrentStaff", () => {
  it("sem sessão, ou sessão de usuário apagado, não há cargo", async () => {
    holder.userId = null
    expect(await getCurrentStaff()).toBeNull()
    holder.userId = "fantasma"
    expect(await getCurrentStaff()).toBeNull()
  })

  it("devolve o cargo guardado; cargo desconhecido no banco vira usuário comum", async () => {
    holder.userId = "mod"
    expect(await getCurrentStaff()).toMatchObject({ id: "mod", role: "moderator" })
    await t.query(`UPDATE "user" SET "role" = 'cargo-estranho' WHERE "id" = 'ana'`)
    holder.userId = "ana"
    expect(await getCurrentStaff()).toMatchObject({ role: "user" })
    expect(await getStaff()).toBeNull()
  })

  it("getStaff / requireStaff / requireAdmin respeitam a hierarquia", async () => {
    holder.userId = "ana"
    expect(await getStaff()).toBeNull()
    await expect(requireStaff()).rejects.toThrow("Acesso restrito à moderação")
    await expect(requireAdmin()).rejects.toThrow("Acesso restrito a administradores")

    holder.userId = "mod"
    expect(await getStaff()).toMatchObject({ role: "moderator" })
    await expect(requireStaff()).resolves.toMatchObject({ id: "mod" })
    await expect(requireAdmin()).rejects.toThrow()

    holder.userId = "adm"
    await expect(requireStaff()).resolves.toMatchObject({ role: "admin" })
    await expect(requireAdmin()).resolves.toMatchObject({ role: "admin" })
  })

  it("isStaffRole: moderador e admin sim, usuário não", () => {
    expect(isStaffRole("moderator")).toBe(true)
    expect(isStaffRole("admin")).toBe(true)
    expect(isStaffRole("user")).toBe(false)
  })
})

describe("o primeiro administrador (ELLOWIN_ADMIN_EMAIL)", () => {
  it("quem tem o e-mail configurado E confirmado vira administrador, e isso fica gravado", async () => {
    vi.stubEnv("ELLOWIN_ADMIN_EMAIL", "ana@teste.dev")
    holder.userId = "ana"

    expect(await getCurrentStaff()).toMatchObject({ id: "ana", role: "admin" })
    expect(await roleOf("ana")).toBe("admin")
  })

  it("sem e-mail confirmado NÃO vira (senão quem se cadastrasse primeiro com o e-mail do admin tomaria o painel)", async () => {
    await addUser("impostor", { email: "dono@empresa.com", emailVerified: false })
    vi.stubEnv("ELLOWIN_ADMIN_EMAIL", "dono@empresa.com")
    holder.userId = "impostor"

    expect(await getCurrentStaff()).toMatchObject({ role: "user" })
    expect(await roleOf("impostor")).toBe("user")
    await expect(requireAdmin()).rejects.toThrow()
  })

  it("compara sem diferenciar maiúsculas nem espaços na configuração", async () => {
    await addUser("dono", { email: "Dono@Empresa.com" })
    vi.stubEnv("ELLOWIN_ADMIN_EMAIL", "  dono@EMPRESA.com  ")
    holder.userId = "dono"
    expect(await getCurrentStaff()).toMatchObject({ role: "admin" })
  })

  it("outro e-mail não é promovido, e sem a variável configurada ninguém é", async () => {
    vi.stubEnv("ELLOWIN_ADMIN_EMAIL", "ana@teste.dev")
    holder.userId = "bia"
    expect(await getCurrentStaff()).toMatchObject({ role: "user" })

    vi.unstubAllEnvs()
    vi.stubEnv("ELLOWIN_ADMIN_EMAIL", "")
    holder.userId = "ana"
    expect(await getCurrentStaff()).toMatchObject({ role: "user" })
  })

  it("só promove quem ainda é usuário comum (nunca rebaixa nem mexe em moderador)", async () => {
    await t.query(`UPDATE "user" SET "email" = 'mod@teste.dev' WHERE "id" = 'mod'`)
    vi.stubEnv("ELLOWIN_ADMIN_EMAIL", "mod@teste.dev")
    holder.userId = "mod"
    expect(await getCurrentStaff()).toMatchObject({ role: "moderator" })
    expect(await roleOf("mod")).toBe("moderator")
  })
})
