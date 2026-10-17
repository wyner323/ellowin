import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * O catch-all do Better Auth (`app/api/auth/[...all]`) é uma superfície HTTP inteira que
 * o app quase não usa. Aqui o handler REAL (lib/auth.ts) responde a cada rota: as que o
 * app não usa têm de dar 404, e as que o login com Google precisa continuam de pé.
 * O banco é o Postgres em memória; a sessão, o e-mail e o `after` do Next são simulados.
 */

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
vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: async () => {},
  sendPasswordChangedEmail: async () => {},
}))
vi.mock("next/server", () => ({ after: () => {} }))

let t: TestDb
let auth: typeof import("@/lib/auth").auth
let DISABLED_AUTH_PATHS: string[]

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres")
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000")
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
  const mod = await import("@/lib/auth")
  auth = mod.auth
  DISABLED_AUTH_PATHS = mod.DISABLED_AUTH_PATHS
}, 90_000)

afterAll(async () => {
  vi.unstubAllEnvs()
  await t.close()
})

const call = (path: string, method: "GET" | "POST") =>
  auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method,
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: method === "POST" ? "{}" : undefined,
    }),
  )

describe("rotas HTTP do Better Auth", () => {
  it("todas as rotas que o app não usa respondem 404, em GET e em POST", async () => {
    for (const path of DISABLED_AUTH_PATHS) {
      for (const method of ["GET", "POST"] as const) {
        const res = await call(path, method)
        expect(res.status, `${method} ${path}`).toBe(404)
      }
    }
  })

  it("a lista cobre as rotas que burlariam as regras do app", () => {
    for (const path of ["/verify-email", "/update-user", "/change-password", "/sign-in/email", "/sign-up/email"]) {
      expect(DISABLED_AUTH_PATHS).toContain(path)
    }
  })

  it("não desliga o que o login com Google e o logout usam", async () => {
    for (const path of ["/sign-in/social", "/callback/google", "/get-session", "/sign-out"]) {
      expect(DISABLED_AUTH_PATHS, path).not.toContain(path)
    }
    expect((await call("/ok", "GET")).status).toBe(200)
    // Sem cookie, get-session responde normalmente (nulo), sem cair em 404.
    expect((await call("/get-session", "GET")).status).not.toBe(404)
  })
})
