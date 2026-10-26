import { expect, test } from "@playwright/test"
import { BUYER, PASSWORD, failOnPageErrors } from "./helpers"

test.describe("login", () => {
  test.beforeEach(({ page }) => failOnPageErrors(page))

  test("senha errada mostra o erro e não entra", async ({ page }) => {
    await page.goto("/entrar")
    await page.getByLabel("Email").fill(BUYER.email)
    await page.getByLabel("Senha").fill("SenhaErrada99")
    await page.getByRole("button", { name: "Entrar", exact: true }).click()
    await expect(page.getByRole("alert")).toBeVisible()
    await expect(page).toHaveURL(/\/entrar/)
  })

  test("email e senha certos levam à conta, e sair derruba a sessão", async ({ page }) => {
    await page.goto("/entrar")
    await page.getByLabel("Email").fill(BUYER.email)
    await page.getByLabel("Senha").fill(PASSWORD)
    await page.getByRole("button", { name: "Entrar", exact: true }).click()
    await expect(page).toHaveURL(/\/conta/)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()

    // depois de entrar, a carteira abre; sem a sessão, volta para o login
    await page.goto("/carteira")
    await expect(page).toHaveURL(/\/carteira/)
    await page.context().clearCookies()
    await page.goto("/carteira")
    await expect(page).toHaveURL(/\/entrar/)
  })
})
