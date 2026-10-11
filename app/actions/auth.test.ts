import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { isValidCpf } from "@/lib/validation"

/**
 * Server actions de conta e login (cadastro, códigos de confirmação, completar
 * perfil, login, redefinição de senha) contra um Postgres em memória com as
 * migrações reais. O Better Auth é trocado por um falso (só o que ele faz fora
 * daqui: criar o usuário e conferir a senha); o limitador de taxa, o ciclo dos
 * códigos (OTP), as regras de CPF/apelido únicos e as mensagens são o código de
 * verdade.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
  ip: null as string | null,
  /** Senha de cada e-mail para o login falso. */
  passwords: {} as Record<string, string>,
  signUpCalls: [] as { name: string; email: string; password: string }[],
  signInCalls: [] as { email: string }[],
  resetRequests: [] as string[],
  validTokens: {} as Record<string, string>,
  resetFails: false,
  resetCalls: 0,
  emailSent: [] as { kind: "email" | "phone"; to: string; code: string }[],
  emailWorks: true,
  nextUser: 1,
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
      signUpEmail: async ({ body }: { body: { name: string; email: string; password: string } }) => {
        holder.signUpCalls.push(body)
        const exists = (await holder.pool.query(`SELECT 1 FROM "user" WHERE "email" = $1`, [body.email])).rows.length > 0
        if (exists) throw new Error("User already exists")
        const id = `u${holder.nextUser++}`
        await holder.pool.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, $2, $3)`, [id, body.name, body.email])
        holder.passwords[body.email] = body.password
      },
      signInEmail: async ({ body }: { body: { email: string; password: string } }) => {
        holder.signInCalls.push({ email: body.email })
        if (holder.passwords[body.email] !== body.password) throw new Error("Invalid email or password")
      },
      requestPasswordReset: async ({ body }: { body: { email: string } }) => {
        holder.resetRequests.push(body.email)
        if (holder.resetFails) throw new Error("falha de envio")
      },
      resetPassword: async ({ body }: { body: { token: string; newPassword: string } }) => {
        holder.resetCalls++
        const email = holder.validTokens[body.token]
        if (!email) throw new Error("INVALID_TOKEN")
        holder.passwords[email] = body.newPassword
      },
    },
  },
}))

vi.mock("@/lib/email", () => ({
  sendEmailOtp: async (to: string, code: string) => {
    holder.emailSent.push({ kind: "email", to, code })
    return holder.emailWorks ? { sent: true } : { sent: false, error: "sem provedor" }
  },
  sendPhoneOtpByEmail: async (to: string, code: string) => {
    holder.emailSent.push({ kind: "phone", to, code })
    return holder.emailWorks ? { sent: true } : { sent: false, error: "sem provedor" }
  },
}))

vi.mock("next/headers", () => ({
  headers: async () => new Headers(holder.ip ? { "x-real-ip": holder.ip } : {}),
}))
vi.mock("next/server", () => ({ after: () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

import {
  completeProfile,
  loginUser,
  registerUser,
  requestPasswordReset,
  resendEmailCode,
  resetPassword,
  sendPhoneCode,
  verifyEmailCode,
  verifyPhoneCode,
} from "@/app/actions/auth"

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
  holder.ip = "203.0.113.7"
  holder.passwords = {}
  holder.signUpCalls.length = 0
  holder.signInCalls.length = 0
  holder.resetRequests.length = 0
  holder.validTokens = {}
  holder.resetFails = false
  holder.resetCalls = 0
  holder.emailSent.length = 0
  holder.emailWorks = true
  holder.nextUser = 1
  await t.query(`TRUNCATE "auth_attempt", "otp_code", "profile", "account", "session", "user" RESTART IDENTITY CASCADE`)
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

const CPF_A = "529.982.247-25"
const CPF_B = "111.444.777-35"
const CPF_C = "123.456.789-09"

/** CPF válido (dígitos verificadores corretos) gerado a partir de um número base de 9 dígitos. */
function cpfFromBase(base: number) {
  const digits = String(base).padStart(9, "0").split("").map(Number)
  const check = (len: number) => {
    const sum = digits.slice(0, len).reduce((acc, d, i) => acc + d * (len + 1 - i), 0)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  digits.push(check(9))
  digits.push(check(10))
  return digits.join("")
}

type Register = Parameters<typeof registerUser>[0]

function birthYearsAgo(years: number) {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  d.setDate(d.getDate() - 2) // folga para o dia do aniversário
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}

const validRegister = (over: Partial<Register> = {}): Register => ({
  fullName: "Maria da Silva",
  displayName: "maria_gamer",
  email: "maria@teste.dev",
  phone: "(11) 99999-1111",
  cpf: CPF_A,
  birthDate: birthYearsAgo(30),
  password: "senha1234",
  acceptedTerms: true,
  ...over,
})

async function rows(text: string, params?: unknown[]) {
  return (await t.query(text, params)).rows
}

const userByEmail = async (email: string) =>
  (await rows(`SELECT * FROM "user" WHERE "email" = $1`, [email]))[0] as
    | { id: string; name: string; email: string; displayName: string | null; emailVerified: boolean }
    | undefined

const profileOf = async (userId: string) =>
  (await rows(`SELECT * FROM "profile" WHERE "userId" = $1`, [userId]))[0] as
    | { fullName: string; cpf: string; phone: string; birthDate: string; cpfVerified: boolean; phoneVerified: boolean }
    | undefined

const userCount = async () => (await rows(`SELECT count(*)::int AS n FROM "user"`))[0].n as number

const otps = (userId: string, channel = "email") =>
  rows(`SELECT * FROM "otp_code" WHERE "userId" = $1 AND "channel" = $2 ORDER BY "id"`, [userId, channel]) as Promise<
    { id: number; code: string; attempts: number; consumedAt: Date | null; expiresAt: Date }[]
  >

/** Cadastra pelo fluxo normal e devolve o usuário criado. */
async function register(over: Partial<Register> = {}) {
  const result = await registerUser(validRegister(over))
  expect(result.ok, result.error).toBe(true)
  return (await userByEmail((over.email ?? "maria@teste.dev").toLowerCase()))!
}

/** Usuário que entrou por fora (como o Google): só nome e e-mail, sem perfil. */
async function addBareUser(id: string, email = `${id}@teste.dev`) {
  await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ($1, $1, $2)`, [id, email])
}

async function addProfile(userId: string, cpf: string) {
  await t.query(
    `INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "birthDate") VALUES ($1, 'Nome Completo', $2, '11999990000', '01/01/1990')`,
    [userId, cpf.replace(/\D/g, "")],
  )
}

/* ---------------------------------------------------------------------------
 * Sanidade dos dados de teste
 * ------------------------------------------------------------------------ */

describe("dados de teste", () => {
  it("os CPFs usados são válidos", () => {
    for (const cpf of [CPF_A, CPF_B, CPF_C]) expect(isValidCpf(cpf), cpf).toBe(true)
  })
})

/* ---------------------------------------------------------------------------
 * registerUser
 * ------------------------------------------------------------------------ */

describe("registerUser: cadastro", () => {
  it("cria usuário, perfil só com dígitos e um código de e-mail de 6 dígitos que expira em ~10 min", async () => {
    const result = await registerUser(validRegister({ email: "  Maria@Teste.DEV  ", fullName: "  Maria da Silva  " }))

    expect(result).toEqual({ ok: true })
    const user = (await userByEmail("maria@teste.dev"))!
    expect(user).toMatchObject({ name: "Maria da Silva", displayName: "maria_gamer", emailVerified: false })
    expect(await profileOf(user.id)).toMatchObject({ fullName: "Maria da Silva", cpf: "52998224725", phone: "11999991111", cpfVerified: true })

    const [otp] = await otps(user.id)
    expect(otp.code).toMatch(/^\d{6}$/)
    expect(otp.attempts).toBe(0)
    const { ms } = (await rows(`SELECT extract(epoch FROM ("expiresAt" - (now() AT TIME ZONE 'UTC'))) * 1000 AS ms FROM "otp_code"`))[0] as { ms: number }
    expect(Number(ms)).toBeGreaterThan(9 * 60_000)
    expect(Number(ms)).toBeLessThanOrEqual(10 * 60_000)
    expect(holder.emailSent).toEqual([{ kind: "email", to: "maria@teste.dev", code: otp.code }])
  })

  it("o e-mail começa NÃO confirmado (cadastro não confirma sozinho)", async () => {
    await register()
    expect((await userByEmail("maria@teste.dev"))!.emailVerified).toBe(false)
  })

  it("apelido é opcional", async () => {
    const user = await register({ displayName: undefined })
    expect(user.displayName).toBeNull()
  })

  it("se o e-mail não puder ser enviado, a conta existe mas o CÓDIGO NÃO VAI PARA O NAVEGADOR", async () => {
    holder.emailWorks = false
    const result = await registerUser(validRegister())

    expect(result.ok).toBe(true)
    expect(result.demoCode).toBeUndefined()
    expect(result.message).toContain("não conseguimos enviar")
    const [otp] = await otps((await userByEmail("maria@teste.dev"))!.id)
    expect(JSON.stringify(result)).not.toContain(otp.code)
  })

  it("só no modo demonstração (ELLOWIN_DEMO_OTP=true) o código aparece na resposta", async () => {
    vi.stubEnv("ELLOWIN_DEMO_OTP", "true")
    vi.resetModules()
    try {
      const demo = await import("@/app/actions/auth")
      holder.emailWorks = false
      const result = await demo.registerUser(validRegister())
      const [otp] = await otps((await userByEmail("maria@teste.dev"))!.id)
      expect(result).toMatchObject({ ok: true, demoCode: otp.code })
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})

describe("registerUser: validação", () => {
  const cases: [string, Partial<Register>, string][] = [
    ["nome de uma palavra só", { fullName: "Maria" }, "fullName"],
    ["nome com número", { fullName: "Maria 2 Silva" }, "fullName"],
    ["apelido curto demais", { displayName: "a" }, "displayName"],
    ["apelido com símbolo", { displayName: "maria<script>" }, "displayName"],
    ["e-mail sem domínio", { email: "maria@teste" }, "email"],
    ["celular sem o 9", { phone: "(11) 3999-1111" }, "phone"],
    ["celular com DDD inexistente", { phone: "(05) 99999-1111" }, "phone"],
    ["CPF com dígito errado", { cpf: "529.982.247-26" }, "cpf"],
    ["CPF de dígitos repetidos", { cpf: "111.111.111-11" }, "cpf"],
    ["menor de 18 anos", { birthDate: birthYearsAgo(17) }, "birthDate"],
    ["data de nascimento em outro formato", { birthDate: "1990-01-01" }, "birthDate"],
    ["data inexistente", { birthDate: "31/02/1990" }, "birthDate"],
    ["senha sem número", { password: "somenteletras" }, "password"],
    ["senha curta", { password: "ab1" }, "password"],
    ["sem aceitar os termos", { acceptedTerms: false }, "acceptedTerms"],
  ]

  it.each(cases)("recusa %s e não cria nada", async (_name, over, field) => {
    const result = await registerUser(validRegister(over))
    expect(result).toMatchObject({ ok: false, field })
    expect(await userCount()).toBe(0)
    expect(holder.signUpCalls).toHaveLength(0)
    expect(holder.emailSent).toHaveLength(0)
  })

  it("aceita a maioridade exata e os formatos com máscara", async () => {
    const result = await registerUser(validRegister({ birthDate: birthYearsAgo(18), phone: "11 99999-1111", cpf: "52998224725" }))
    expect(result.ok, result.error).toBe(true)
  })
})

describe("registerUser: duplicidade", () => {
  it("CPF é único mesmo escrito com ou sem máscara", async () => {
    await register()

    for (const cpf of [CPF_A, "52998224725", " 529 982 247 25 "]) {
      const result = await registerUser(validRegister({ email: `outra${cpf.length}@teste.dev`, displayName: undefined, cpf }))
      expect(result, cpf).toMatchObject({ ok: false, field: "cpf" })
    }
    expect(await userCount()).toBe(1)
  })

  it("apelido é único sem diferenciar maiúsculas", async () => {
    await register()
    const result = await registerUser(validRegister({ email: "outra@teste.dev", cpf: CPF_B, displayName: "MARIA_GAMER" }))
    expect(result).toMatchObject({ ok: false, field: "displayName" })
    expect(await userCount()).toBe(1)
  })

  it("e-mail já cadastrado vira erro de e-mail, sem criar perfil", async () => {
    await register()
    const result = await registerUser(validRegister({ displayName: "outro_nome", cpf: CPF_B }))
    expect(result).toMatchObject({ ok: false, field: "email", error: "Já existe uma conta com este email." })
    expect((await rows(`SELECT count(*)::int AS n FROM "profile"`))[0].n).toBe(1)
  })
})

describe("registerUser: limite de cadastros", () => {
  it("no máximo 5 por hora por endereço (IP)", async () => {
    const cpfs = [CPF_A, CPF_B, CPF_C, "987.654.321-00", "000.000.001-91"]
    for (let i = 0; i < 5; i++) {
      // CPFs diferentes só importam se válidos; aqui as tentativas contam mesmo quando recusadas.
      await registerUser(validRegister({ email: `p${i}@teste.dev`, displayName: undefined, cpf: cpfs[i] }))
    }
    const blocked = await registerUser(validRegister({ email: "p6@teste.dev", displayName: undefined, cpf: "711.164.480-71" }))
    expect(blocked).toMatchObject({ ok: false })
    expect(blocked.error).toContain("Muitos cadastros")
  })

  it("IPs diferentes têm contagens separadas", async () => {
    for (let i = 0; i < 6; i++) await registerUser(validRegister({ email: `a${i}@teste.dev`, cpf: "000" }))
    holder.ip = "198.51.100.9"
    const result = await registerUser(validRegister())
    expect(result.ok, result.error).toBe(true)
  })
})

/* ---------------------------------------------------------------------------
 * Códigos de confirmação (OTP)
 * ------------------------------------------------------------------------ */

describe("verifyEmailCode", () => {
  it("o código certo confirma o e-mail e só vale uma vez", async () => {
    const user = await register()
    holder.userId = user.id
    const [otp] = await otps(user.id)

    expect(await verifyEmailCode(otp.code)).toMatchObject({ ok: true, message: "Email confirmado." })
    expect((await userByEmail("maria@teste.dev"))!.emailVerified).toBe(true)
    expect((await otps(user.id))[0].consumedAt).not.toBeNull()

    const again = await verifyEmailCode(otp.code)
    expect(again.ok).toBe(false)
    expect(again.error).toContain("Nenhum código ativo") // o código usado nem é considerado
  })

  it("exige estar logado", async () => {
    holder.userId = null
    await expect(verifyEmailCode("123456")).rejects.toThrow("Não autenticado")
  })

  it("código errado conta tentativa e avisa quantas restam; depois de 5, nem o certo vale", async () => {
    const user = await register()
    holder.userId = user.id
    const [otp] = await otps(user.id)
    const wrong = otp.code === "000000" ? "111111" : "000000"

    const first = await verifyEmailCode(wrong)
    expect(first).toMatchObject({ ok: false })
    expect(first.error).toContain("4 tentativas")
    for (let i = 0; i < 4; i++) await verifyEmailCode(wrong)

    const exhausted = await verifyEmailCode(otp.code)
    expect(exhausted.ok).toBe(false)
    expect(exhausted.error).toContain("Tentativas esgotadas")
    expect((await userByEmail("maria@teste.dev"))!.emailVerified).toBe(false)
    expect((await otps(user.id))[0].attempts).toBe(5)
  })

  it("código com tamanho errado nem consome tentativa", async () => {
    const user = await register()
    holder.userId = user.id
    for (const bad of ["", "12345", "1234567", "abcdef"]) {
      expect((await verifyEmailCode(bad)).ok, bad).toBe(false)
    }
    expect((await otps(user.id))[0].attempts).toBe(0)
  })

  it("código vencido é recusado", async () => {
    const user = await register()
    holder.userId = user.id
    const [otp] = await otps(user.id)
    await t.query(`UPDATE "otp_code" SET "expiresAt" = now() - interval '1 minute' WHERE "id" = $1`, [otp.id])

    const result = await verifyEmailCode(otp.code)
    expect(result.ok).toBe(false)
    expect(result.error).toContain("expirado")
  })

  it("sem código ativo", async () => {
    await addBareUser("u9")
    holder.userId = "u9"
    expect((await verifyEmailCode("123456")).error).toContain("Nenhum código ativo")
  })

  it("só vale o código mais recente", async () => {
    const user = await register()
    holder.userId = user.id
    const [old] = await otps(user.id)
    await t.query(`UPDATE "otp_code" SET "createdAt" = now() - interval '1 minute' WHERE "id" = $1`, [old.id])
    await t.query(`INSERT INTO "otp_code" ("userId", "channel", "destination", "code", "expiresAt") VALUES ($1, 'email', 'maria@teste.dev', '654321', now() + interval '10 minutes')`, [user.id])
    // Garante que o código antigo seja diferente do novo.
    await t.query(`UPDATE "otp_code" SET "code" = '111222' WHERE "id" = $1`, [old.id])

    expect((await verifyEmailCode("111222")).ok).toBe(false)
    expect((await verifyEmailCode("654321")).ok).toBe(true)
  })

  it("código de outro usuário não confirma a minha conta", async () => {
    const maria = await register()
    const joao = await register({ email: "joao@teste.dev", displayName: "joao_gamer", cpf: CPF_B, fullName: "João Pereira" })
    const [mariaOtp] = await otps(maria.id)

    holder.userId = joao.id
    const result = await verifyEmailCode(mariaOtp.code)
    expect(result.ok).toBe(false)
    expect((await userByEmail("joao@teste.dev"))!.emailVerified).toBe(false)
    expect((await userByEmail("maria@teste.dev"))!.emailVerified).toBe(false)
  })

  it("um código de telefone não confirma o e-mail", async () => {
    const user = await register()
    holder.userId = user.id
    await t.query(`UPDATE "otp_code" SET "consumedAt" = now() WHERE "userId" = $1`, [user.id])
    await t.query(`INSERT INTO "otp_code" ("userId", "channel", "destination", "code", "expiresAt") VALUES ($1, 'phone', '11999991111', '777888', now() + interval '10 minutes')`, [user.id])

    expect((await verifyEmailCode("777888")).ok).toBe(false)
    expect((await userByEmail("maria@teste.dev"))!.emailVerified).toBe(false)
  })
})

describe("resendEmailCode", () => {
  it("exige sessão e não reenvia para e-mail já confirmado", async () => {
    holder.userId = null
    expect(await resendEmailCode()).toEqual({ ok: false, error: "Sessão expirada." })

    const user = await register()
    await t.query(`UPDATE "user" SET "emailVerified" = true WHERE "id" = $1`, [user.id])
    holder.userId = user.id
    const before = holder.emailSent.length
    expect(await resendEmailCode()).toMatchObject({ ok: true, message: "Seu email já está confirmado." })
    expect(holder.emailSent).toHaveLength(before)
  })

  it("respeita o intervalo de 30s entre códigos", async () => {
    const user = await register()
    holder.userId = user.id

    const tooSoon = await resendEmailCode()
    expect(tooSoon.ok).toBe(false)
    expect(tooSoon.error).toMatch(/Aguarde \d+s/)
    expect(await otps(user.id)).toHaveLength(1)

    await t.query(`UPDATE "otp_code" SET "createdAt" = now() - interval '31 seconds' WHERE "userId" = $1`, [user.id])
    expect(await resendEmailCode()).toMatchObject({ ok: true })
    expect(await otps(user.id)).toHaveLength(2)
  })

  it("falha de envio não entrega o código ao navegador", async () => {
    const user = await register()
    holder.userId = user.id
    await t.query(`UPDATE "otp_code" SET "createdAt" = now() - interval '1 minute' WHERE "userId" = $1`, [user.id])
    holder.emailWorks = false

    const result = await resendEmailCode()
    expect(result).toMatchObject({ ok: false })
    expect(result.demoCode).toBeUndefined()
    const codes = (await otps(user.id)).map((o) => o.code)
    for (const code of codes) expect(JSON.stringify(result)).not.toContain(code)
  })
})

describe("telefone", () => {
  it("o código do telefone vai para o e-mail e, confirmado, marca o telefone", async () => {
    const user = await register()
    holder.userId = user.id

    expect(await sendPhoneCode()).toMatchObject({ ok: true })
    const sent = holder.emailSent.at(-1)!
    expect(sent).toMatchObject({ kind: "phone", to: "maria@teste.dev" })

    expect(await verifyPhoneCode(sent.code)).toMatchObject({ ok: true, message: "Telefone confirmado." })
    expect((await profileOf(user.id))!.phoneVerified).toBe(true)
    expect(await sendPhoneCode()).toMatchObject({ ok: true, message: "Seu telefone já está confirmado." })
  })

  it("sem telefone cadastrado, intervalo entre códigos e falha de envio", async () => {
    await addBareUser("u9")
    holder.userId = "u9"
    expect(await sendPhoneCode()).toEqual({ ok: false, error: "Nenhum telefone cadastrado." })

    const user = await register()
    holder.userId = user.id
    await sendPhoneCode()
    expect((await sendPhoneCode()).error).toMatch(/Aguarde \d+s/)

    await t.query(`UPDATE "otp_code" SET "createdAt" = now() - interval '1 minute' WHERE "userId" = $1`, [user.id])
    holder.emailWorks = false
    const failed = await sendPhoneCode()
    expect(failed).toMatchObject({ ok: false })
    expect(failed.demoCode).toBeUndefined()
  })
})

/* ---------------------------------------------------------------------------
 * completeProfile (quem entrou pelo Google)
 * ------------------------------------------------------------------------ */

type Complete = Parameters<typeof completeProfile>[0]

const validComplete = (over: Partial<Complete> = {}): Complete => ({
  fullName: "Carlos Eduardo Lima",
  displayName: "carlos_e",
  phone: "(21) 98888-7777",
  cpf: CPF_B,
  birthDate: birthYearsAgo(25),
  acceptedTerms: true,
  ...over,
})

describe("completeProfile", () => {
  it("cria o perfil, troca o nome pelo nome legal e define o apelido", async () => {
    await addBareUser("g1")
    holder.userId = "g1"

    expect(await completeProfile(validComplete())).toEqual({ ok: true })

    expect(await profileOf("g1")).toMatchObject({ fullName: "Carlos Eduardo Lima", cpf: "11144477735", phone: "21988887777", cpfVerified: true })
    expect((await rows(`SELECT "name", "displayName" FROM "user" WHERE "id" = 'g1'`))[0]).toEqual({ name: "Carlos Eduardo Lima", displayName: "carlos_e" })
  })

  it("exige estar logado e as mesmas validações do cadastro", async () => {
    holder.userId = null
    await expect(completeProfile(validComplete())).rejects.toThrow("Não autenticado")

    await addBareUser("g1")
    holder.userId = "g1"
    expect(await completeProfile(validComplete({ cpf: "123.456.789-00" }))).toMatchObject({ ok: false, field: "cpf" })
    expect(await completeProfile(validComplete({ birthDate: birthYearsAgo(16) }))).toMatchObject({ ok: false, field: "birthDate" })
    expect(await completeProfile(validComplete({ phone: "123" }))).toMatchObject({ ok: false, field: "phone" })
    expect(await completeProfile(validComplete({ fullName: "Carlos" }))).toMatchObject({ ok: false, field: "fullName" })
    expect(await completeProfile(validComplete({ acceptedTerms: false }))).toMatchObject({ ok: false, field: "acceptedTerms" })
    expect(await profileOf("g1")).toBeUndefined()
  })

  it("CPF de outra conta é recusado, mas o próprio CPF pode ser reenviado", async () => {
    await addBareUser("g1")
    await addBareUser("g2")
    await addProfile("g2", CPF_B)

    holder.userId = "g1"
    expect(await completeProfile(validComplete({ cpf: CPF_B }))).toMatchObject({ ok: false, field: "cpf" })
    expect(await profileOf("g1")).toBeUndefined()

    holder.userId = "g2"
    expect((await completeProfile(validComplete({ cpf: CPF_B, displayName: "g2_nick" }))).ok).toBe(true)
  })

  it("apelido de outra pessoa é recusado (sem diferenciar maiúsculas)", async () => {
    await addBareUser("g1")
    await addBareUser("g2")
    await t.query(`UPDATE "user" SET "displayName" = 'Carlos_E' WHERE "id" = 'g2'`)

    holder.userId = "g1"
    expect(await completeProfile(validComplete())).toMatchObject({ ok: false, field: "displayName" })
  })

  it("limita a 10 tentativas por hora (as de formato inválido nem chegam a contar: o limite protege a consulta de CPF)", async () => {
    await addBareUser("g1")
    holder.userId = "g1"
    // CPFs válidos que já existem em outras contas: é isso que o limite freia (sondar quem tem conta).
    for (let i = 0; i < 10; i++) {
      const cpf = cpfFromBase(100_000_000 + i)
      expect(isValidCpf(cpf)).toBe(true)
      await addBareUser(`o${i}`)
      await addProfile(`o${i}`, cpf)
      expect((await completeProfile(validComplete({ cpf }))).field, `tentativa ${i + 1}`).toBe("cpf")
    }
    const blocked = await completeProfile(validComplete({ cpf: cpfFromBase(100_000_050) }))
    expect(blocked).toMatchObject({ ok: false })
    expect(blocked.error).toContain("Muitas tentativas")
    expect(await profileOf("g1")).toBeUndefined()
  })
})

/* ---------------------------------------------------------------------------
 * loginUser
 * ------------------------------------------------------------------------ */

describe("loginUser", () => {
  beforeEach(() => {
    holder.passwords["ana@teste.dev"] = "senha1234"
  })

  it("entra com e-mail (normalizado) e senha certos", async () => {
    expect(await loginUser({ email: "  ANA@Teste.dev ", password: "senha1234" })).toEqual({ ok: true })
    expect(holder.signInCalls).toEqual([{ email: "ana@teste.dev" }])
  })

  it("senha errada e e-mail inexistente dão exatamente a mesma resposta (sem revelar quem tem conta)", async () => {
    const wrongPassword = await loginUser({ email: "ana@teste.dev", password: "errada123" })
    const unknownEmail = await loginUser({ email: "ninguem@teste.dev", password: "senha1234" })

    expect(wrongPassword).toEqual({ ok: false, error: "Email ou senha incorretos." })
    expect(unknownEmail).toEqual(wrongPassword)
  })

  it("depois de 8 tentativas no mesmo e-mail, bloqueia — mesmo com a senha certa", async () => {
    for (let i = 0; i < 8; i++) await loginUser({ email: "ana@teste.dev", password: `errada${i}123` })
    const calls = holder.signInCalls.length

    const blocked = await loginUser({ email: "ana@teste.dev", password: "senha1234" })
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toContain("Muitas tentativas de login")
    expect(holder.signInCalls).toHaveLength(calls) // nem chegou a conferir a senha
  })

  it("o bloqueio por e-mail vale de qualquer IP (senha chutada a partir de vários IPs)", async () => {
    for (let i = 0; i < 8; i++) {
      holder.ip = `203.0.113.${i + 10}`
      await loginUser({ email: "ana@teste.dev", password: `errada${i}123` })
    }
    holder.ip = "198.51.100.77"
    expect((await loginUser({ email: "ana@teste.dev", password: "senha1234" })).ok).toBe(false)
  })

  it("o bloqueio por IP vale para vários e-mails (30 em 10 min)", async () => {
    for (let i = 0; i < 30; i++) await loginUser({ email: `alvo${i}@teste.dev`, password: "chute12345" })
    const blocked = await loginUser({ email: "ana@teste.dev", password: "senha1234" })
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toContain("Muitas tentativas de login")
  })

  it("login bem-sucedido zera o contador do e-mail", async () => {
    for (let i = 0; i < 7; i++) await loginUser({ email: "ana@teste.dev", password: `errada${i}123` })
    expect((await loginUser({ email: "ana@teste.dev", password: "senha1234" })).ok).toBe(true)

    // Sem o zeramento, a 9ª tentativa seguinte estouraria o limite de 8.
    for (let i = 0; i < 7; i++) expect((await loginUser({ email: "ana@teste.dev", password: `errada${i}123` })).error).toBe("Email ou senha incorretos.")
  })

  it("tentativas com mais de 10 minutos não contam", async () => {
    for (let i = 0; i < 8; i++) await loginUser({ email: "ana@teste.dev", password: `errada${i}123` })
    await t.query(`UPDATE "auth_attempt" SET "createdAt" = now() - interval '11 minutes'`)
    expect((await loginUser({ email: "ana@teste.dev", password: "senha1234" })).ok).toBe(true)
  })

  it("e-mail gigante é cortado antes de virar chave do limitador", async () => {
    await loginUser({ email: `${"a".repeat(400)}@teste.dev`, password: "x" })
    const keys = (await rows(`SELECT "key" FROM "auth_attempt"`)).map((r) => r.key as string)
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThan(300)
  })
})

/* ---------------------------------------------------------------------------
 * Redefinição de senha
 * ------------------------------------------------------------------------ */

describe("requestPasswordReset", () => {
  it("a resposta é a mesma exista a conta ou não, e mesmo se o envio falhar", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const existing = await requestPasswordReset({ email: "ana@teste.dev" })
    holder.resetFails = true
    holder.ip = "198.51.100.1"
    const failing = await requestPasswordReset({ email: "ana2@teste.dev" })
    holder.resetFails = false
    holder.ip = "198.51.100.2"
    const unknown = await requestPasswordReset({ email: "ninguem@teste.dev" })
    consoleError.mockRestore()

    expect(existing.ok).toBe(true)
    expect(failing).toEqual(existing)
    expect(unknown).toEqual(existing)
    expect(existing.message).toContain("Se existir uma conta")
  })

  it("normaliza o e-mail e recusa e-mail inválido sem consultar o provedor", async () => {
    await requestPasswordReset({ email: "  ANA@Teste.dev " })
    expect(holder.resetRequests).toEqual(["ana@teste.dev"])

    expect(await requestPasswordReset({ email: "isso-nao-e-email" })).toMatchObject({ ok: false, field: "email" })
    expect(holder.resetRequests).toHaveLength(1)
  })

  it("no máximo 3 pedidos por e-mail por hora", async () => {
    for (let i = 0; i < 3; i++) expect((await requestPasswordReset({ email: "ana@teste.dev" })).ok).toBe(true)
    const blocked = await requestPasswordReset({ email: "ana@teste.dev" })
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toContain("Muitos pedidos")
    expect(holder.resetRequests).toHaveLength(3)

    expect((await requestPasswordReset({ email: "outra@teste.dev" })).ok).toBe(true)
  })

  it("no máximo 10 pedidos por IP por hora (não dá para encher a caixa de várias pessoas)", async () => {
    for (let i = 0; i < 10; i++) expect((await requestPasswordReset({ email: `alvo${i}@teste.dev` })).ok).toBe(true)
    expect((await requestPasswordReset({ email: "alvo99@teste.dev" })).ok).toBe(false)
    expect(holder.resetRequests).toHaveLength(10)
  })
})

describe("resetPassword", () => {
  it("troca a senha com um token válido e a nova senha passa a valer no login", async () => {
    holder.passwords["ana@teste.dev"] = "antiga1234"
    holder.validTokens["tok-ok"] = "ana@teste.dev"

    expect(await resetPassword({ token: "tok-ok", password: "novasenha99" })).toMatchObject({ ok: true })
    expect((await loginUser({ email: "ana@teste.dev", password: "novasenha99" })).ok).toBe(true)
    expect((await loginUser({ email: "ana@teste.dev", password: "antiga1234" })).ok).toBe(false)
  })

  it("token vazio, enorme ou inválido dão a mesma resposta genérica", async () => {
    const generic = { ok: false, error: "Link inválido ou expirado. Peça um novo." }
    expect(await resetPassword({ token: "", password: "novasenha99" })).toEqual(generic)
    expect(await resetPassword({ token: "x".repeat(201), password: "novasenha99" })).toEqual(generic)
    expect(holder.resetCalls).toBe(0) // token vazio ou enorme nem chega ao provedor
    expect(await resetPassword({ token: "inventado", password: "novasenha99" })).toEqual(generic)
  })

  it("recusa senha fraca antes de gastar o token", async () => {
    holder.validTokens["tok-ok"] = "ana@teste.dev"
    expect(await resetPassword({ token: "tok-ok", password: "fraca" })).toMatchObject({ ok: false, field: "password" })
    expect(holder.validTokens["tok-ok"]).toBe("ana@teste.dev")
  })

  it("limita a 10 tentativas por hora por IP (chutar tokens)", async () => {
    for (let i = 0; i < 10; i++) await resetPassword({ token: `chute-${i}`, password: "novasenha99" })
    const blocked = await resetPassword({ token: "chute-final", password: "novasenha99" })
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toContain("Muitas tentativas")
  })
})
