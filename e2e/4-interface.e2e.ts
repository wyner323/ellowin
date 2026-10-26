import { expect, test } from "@playwright/test"
import { BUYER, LISTING, authFile, failOnPageErrors, query } from "./helpers"

// O que os testes de página (que não rodam JavaScript de cliente) não enxergam: cliques, estado e layout no navegador.

test.describe("interface (componentes de cliente)", () => {
  test.beforeEach(({ page }) => failOnPageErrors(page))

  test("o tema escolhido vira classe na página, vai para o cookie e sobrevive ao recarregar", async ({ page }) => {
    await page.goto("/")
    const html = page.locator("html")
    await page.getByRole("button", { name: /^Tema: .*Alterar tema/ }).click()
    await page.getByRole("menuitemradio", { name: "Escuro" }).click()
    await expect(html).toHaveClass(/dark/)
    const cookies = await page.context().cookies()
    expect(cookies.find((c) => c.name === "ellowin-theme")?.value).toBe("dark")
    await page.reload()
    await expect(html).toHaveClass(/dark/)
  })

  test("celular (375px): sem rolagem lateral na home, no anúncio e no login, e o menu abre", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    for (const path of ["/", `/produtos/${LISTING.slug}`, "/entrar", "/jogos"]) {
      await page.goto(path)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${path} rola para o lado`).toBeLessThanOrEqual(0)
    }
    await page.goto("/")
    await page.getByRole("button", { name: "Abrir menu de categorias" }).click()
    await expect(page.getByRole("menuitem", { name: /Criar conta/ })).toBeVisible()
  })

  test.describe("favoritos (comprador logado)", () => {
    test.use({ storageState: authFile("buyer") })

    test("guardar e remover um anúncio dos favoritos", async ({ page }) => {
      await page.goto(`/produtos/${LISTING.slug}`)
      await page.getByRole("button", { name: "Guardar nos favoritos" }).click()
      await expect(page.getByRole("button", { name: "Nos favoritos" })).toBeVisible()
      await expect.poll(async () => (await query(`SELECT 1 FROM "favorite" WHERE "userId" = $1`, [BUYER.id])).length).toBe(1)

      await page.goto("/favoritos")
      await expect(page.getByText(LISTING.title).first()).toBeVisible()

      await page.goto(`/produtos/${LISTING.slug}`)
      await page.getByRole("button", { name: "Nos favoritos" }).click()
      await expect(page.getByRole("button", { name: "Guardar nos favoritos" })).toBeVisible()
      await expect.poll(async () => (await query(`SELECT 1 FROM "favorite" WHERE "userId" = $1`, [BUYER.id])).length).toBe(0)
    })

    test("o estoque do anúncio caiu com a compra", async ({ page }) => {
      const [{ stock }] = await query<{ stock: number }>(`SELECT "stock" FROM "product_variant" LIMIT 1`)
      expect(stock).toBe(4)
      await page.goto(`/produtos/${LISTING.slug}`)
      await expect(page.getByText("Saldo disponível: R$ 450,00")).toBeVisible()
    })
  })
})
