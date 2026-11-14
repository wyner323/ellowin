import { expect, test, type Browser, type Page } from "@playwright/test"
import { BUYER, RECARGA, SELLER, authFile, failOnPageErrors, query } from "./helpers"

/**
 * As categorias novas num navegador de verdade: o índice público, o pedido de aprovação do vendedor e a decisão da moderação
 * (componentes de cliente que os testes de página não executam) e a compra de uma recarga, que pede o ID do jogador antes de pagar.
 * Roda depois da compra de 3-compra (que usa o saldo do comprador) e de 4-interface (que confere o saldo restante).
 */

test.describe("categorias novas", () => {
  test.beforeEach(({ page }) => failOnPageErrors(page))

  test("o índice mostra todas as categorias e a página de uma categoria sem anúncio fica fora do Google", async ({ page }) => {
    await page.goto("/catalogo")
    for (const name of ["Itens de jogo", "Recargas por ID", "Assinaturas e premium", "Keys de jogos", "Redes sociais", "Cursos e guias"]) {
      await expect(page.getByRole("heading", { name })).toBeVisible()
    }
    await page.goto("/catalogo/keys")
    await expect(page.getByRole("heading", { level: 1, name: "Keys de jogos" })).toBeVisible()
    await expect(page.locator("head meta[name='robots']")).toHaveAttribute("content", /noindex/)
    await page.goto("/catalogo/recargas")
    await expect(page.locator("head meta[name='robots']")).toHaveCount(0)
  })

  test("o cabeçalho leva ao índice de categorias", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("link", { name: "Todas as categorias" }).first().click()
    await expect(page).toHaveURL(/\/catalogo$/)
  })
})

test.describe("aprovação de categoria", () => {
  let modPage: Page
  let closeMod: () => Promise<void>

  test.describe.configure({ mode: "serial" })
  test.use({ storageState: authFile("seller") })

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const context = await browser.newContext({ storageState: authFile("mod"), locale: "pt-BR" })
    modPage = await context.newPage()
    closeMod = () => context.close()
  })
  test.afterAll(async () => {
    await closeMod?.()
  })
  test.beforeEach(({ page }) => {
    failOnPageErrors(page)
    failOnPageErrors(modPage)
  })

  test("o vendedor vê a categoria travada e pede aprovação, com a explicação", async ({ page }) => {
    await page.goto("/painel/vendedor/categorias")
    const section = page.getByRole("region", { name: "Assinaturas e premium" })
    await expect(section.getByRole("button", { name: "Pedir aprovação" })).toBeDisabled()

    await section.getByLabel(/De onde vêm as assinaturas/).fill("Compro as assinaturas em um revendedor autorizado, com nota.")
    await section.getByRole("button", { name: "Pedir aprovação" }).click()
    await expect(section.getByText("Em análise")).toBeVisible()
    const [row] = await query<{ status: string }>(`SELECT "status" FROM "seller_category_approval" WHERE "userId" = $1 AND "categorySlug" = 'assinaturas'`, [SELLER.id])
    expect(row.status).toBe("pendente")
  })

  test("a moderação recusa sem motivo (erro) e aprova; o vendedor passa a poder anunciar na categoria", async ({ page }) => {
    await modPage.goto("/admin/categorias")
    const card = modPage.getByRole("article").filter({ hasText: "Assinaturas e premium" })
    await expect(card.getByText("Compro as assinaturas em um revendedor autorizado, com nota.")).toBeVisible()

    await card.getByRole("button", { name: "Recusar" }).click()
    await expect(card.getByRole("alert")).toContainText("motivo")
    expect((await query<{ status: string }>(`SELECT "status" FROM "seller_category_approval" WHERE "userId" = $1 AND "categorySlug" = 'assinaturas'`, [SELLER.id]))[0].status).toBe("pendente")

    await card.getByRole("button", { name: "Aprovar" }).click()
    await expect
      .poll(async () => (await query<{ status: string }>(`SELECT "status" FROM "seller_category_approval" WHERE "userId" = $1 AND "categorySlug" = 'assinaturas'`, [SELLER.id]))[0].status)
      .toBe("aprovado")

    await page.goto("/painel/vendedor/categorias")
    await expect(page.getByRole("region", { name: "Assinaturas e premium" }).getByText("Aprovado")).toBeVisible()
    // o formulário agora oferece a categoria
    await page.goto("/painel/vendedor/produtos/novo")
    await page.getByRole("button", { name: "Prefiro preencher manualmente" }).click()
    await expect(page.getByRole("radio", { name: /Assinaturas e premium/ })).toBeVisible()
    await expect(page.getByRole("radio", { name: /Keys de jogos/ })).toHaveCount(0)
  })
})

test.describe("recarga por ID", () => {
  test.use({ storageState: authFile("buyer") })
  test.beforeEach(({ page }) => failOnPageErrors(page))

  test("o botão de comprar só libera com o ID do jogador, e o pedido guarda e mostra o que foi informado", async ({ page }) => {
    await page.goto(`/produtos/${RECARGA.slug}`)
    const buy = page.getByRole("button", { name: "Comprar agora" })
    await expect(buy).toBeDisabled()
    await page.getByLabel("ID ou apelido no jogo").fill("Fulano#1234")
    await page.getByLabel(/Servidor ou região/).fill("Brasil")
    await expect(buy).toBeEnabled()
    await buy.click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar compra" }).click()

    await expect(page).toHaveURL(/\/pedidos\/\d+/)
    const orderId = Number(new URL(page.url()).pathname.split("/").pop())
    await expect(page.getByText("Dados informados pelo comprador")).toBeVisible()
    await expect(page.getByText("Fulano#1234")).toBeVisible()
    const [info] = await query<{ info: Record<string, string> }>(`SELECT "info" FROM "order_buyer_info" WHERE "orderId" = $1`, [orderId])
    expect(info.info).toEqual({ playerId: "Fulano#1234", server: "Brasil" })
    const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM "order" WHERE "buyerId" = $1 AND "id" = $2`, [BUYER.id, orderId])
    expect(n).toBe(1)
  })

  test("o vendedor vê os mesmos dados no pedido", async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile("seller"), locale: "pt-BR" })
    const page = await context.newPage()
    const [{ id }] = await query<{ id: number }>(`SELECT "id" FROM "order" WHERE "productTitle" = $1`, [RECARGA.title])
    await page.goto(`/pedidos/${id}`)
    await expect(page.getByText("Dados informados pelo comprador")).toBeVisible()
    await expect(page.getByText("Fulano#1234")).toBeVisible()
    await context.close()
  })
})
