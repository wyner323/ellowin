import { expect, type Page } from "@playwright/test"
import pg from "pg"
import { BUYER, PASSWORD, SELLER, e2eDatabaseUrl } from "./env.mjs"

export { BUYER, PASSWORD, SELLER }
export { LISTING } from "./env.mjs"

/** Consulta direta ao banco de teste (nunca o de produção: ver e2e/env.mjs) para conferir o dinheiro e o estado. */
export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: e2eDatabaseUrl() })
  await client.connect()
  try {
    return (await client.query(text, params)).rows as T[]
  } finally {
    await client.end()
  }
}

export const AUTH_DIR = "e2e/.auth"
export const authFile = (who: "buyer" | "seller") => `${AUTH_DIR}/${who}.json`

/** Entra pela tela de login, como uma pessoa faria. */
export async function login(page: Page, email: string) {
  await page.goto("/entrar")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Senha").fill(PASSWORD)
  await page.getByRole("button", { name: "Entrar", exact: true }).click()
  await expect(page).toHaveURL(/\/conta/)
}

/** Falha o teste se a página lançar um erro de JavaScript não tratado. */
export function failOnPageErrors(page: Page) {
  page.on("pageerror", (error) => {
    throw error
  })
}
