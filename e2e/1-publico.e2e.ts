import { expect, test } from "@playwright/test"
import { LISTING, SELLER, failOnPageErrors } from "./helpers"

test.describe("visitante (sem login)", () => {
  test.beforeEach(({ page }) => failOnPageErrors(page))

  test("a home abre, mostra o anúncio da semente e o cabeçalho", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("main#conteudo")).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.getByText(LISTING.title).first()).toBeVisible()
  })

  test("a busca encontra o anúncio pelo título", async ({ page }) => {
    await page.goto(`/busca?q=${encodeURIComponent("Valorant E2E")}`)
    const card = page.getByRole("link", { name: new RegExp(LISTING.title) }).first()
    await expect(card).toBeVisible()
    await card.click()
    await expect(page).toHaveURL(new RegExp(`/produtos/${LISTING.slug}`))
  })

  test("a página do anúncio mostra preço, custódia e pede login para comprar", async ({ page }) => {
    await page.goto(`/produtos/${LISTING.slug}`)
    await expect(page.getByRole("heading", { level: 1, name: LISTING.title })).toBeVisible()
    await expect(page.getByText("R$ 50,00").first()).toBeVisible()
    await expect(page.getByText(/retido em custódia/)).toBeVisible()
    const login = page.getByRole("button", { name: "Entrar para comprar" })
    await expect(login).toBeVisible()
    await login.click()
    await expect(page).toHaveURL(/\/entrar/)
  })

  test("a loja pública mostra o apelido do vendedor, não o nome legal", async ({ page }) => {
    await page.goto(`/loja/${SELLER.storeSlug}`)
    await expect(page.getByText(LISTING.title).first()).toBeVisible()
    await expect(page.locator("body")).not.toContainText("Vendedor E2E")
  })

  test("rotas privadas mandam para o login", async ({ page }) => {
    for (const path of ["/pedidos", "/carteira", "/painel/vendedor", "/favoritos"]) {
      await page.goto(path)
      await expect(page, path).toHaveURL(/\/entrar/)
    }
  })

  test("anúncio inexistente mostra a tela de não encontrado e não é indexado", async ({ page }) => {
    await page.goto("/produtos/nao-existe-mesmo")
    await expect(page.locator("main#conteudo")).toBeVisible()
    await expect(page.locator("head meta[name='robots']")).toHaveAttribute("content", /noindex/)
    await expect(page.getByText(LISTING.title)).toHaveCount(0)
  })
})
