import { test as setup } from "@playwright/test"
import { BUYER, MOD, SELLER, authFile, login } from "./helpers"

// Entra uma vez com cada conta da semente e guarda a sessão, para os testes não repetirem o login.
setup("sessão do comprador", async ({ page }) => {
  await login(page, BUYER.email)
  await page.context().storageState({ path: authFile("buyer") })
})

setup("sessão do moderador", async ({ page }) => {
  await login(page, MOD.email)
  await page.context().storageState({ path: authFile("mod") })
})

setup("sessão do vendedor", async ({ page }) => {
  await login(page, SELLER.email)
  await page.context().storageState({ path: authFile("seller") })
})

