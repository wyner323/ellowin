import { expect, test, type Browser, type Page } from "@playwright/test"
import { BUYER, LISTING, SELLER, authFile, failOnPageErrors, query } from "./helpers"

/**
 * A viagem completa do dinheiro com dois navegadores: o comprador paga, o vendedor entrega, o comprador confirma, avalia
 * e o vendedor responde. Em cada etapa confere no banco que o dinheiro está onde deveria (custódia, depois vendedor).
 */

test.describe.configure({ mode: "serial" })

let orderId = 0
let sellerPage: Page
let sellerClose: () => Promise<void>

const wallet = async (userId: string) =>
  (await query<{ availableCents: number; heldCents: number }>(`SELECT "availableCents", "heldCents" FROM "wallet" WHERE "userId" = $1`, [userId]))[0]

test.use({ storageState: authFile("buyer") })

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  const context = await browser.newContext({ storageState: authFile("seller"), locale: "pt-BR" })
  sellerPage = await context.newPage()
  sellerClose = () => context.close()
})
test.afterAll(async () => {
  await sellerClose?.()
})
test.beforeEach(({ page }) => {
  failOnPageErrors(page)
  failOnPageErrors(sellerPage)
})

test("o comprador paga: o valor sai do saldo e fica em custódia", async ({ page }) => {
  await page.goto(`/produtos/${LISTING.slug}`)
  await expect(page.getByText(`Saldo disponível: R$ 500,00`)).toBeVisible()

  await page.getByRole("button", { name: "Comprar agora" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar compra" }).click()

  await expect(page).toHaveURL(/\/pedidos\/\d+/)
  orderId = Number(new URL(page.url()).pathname.split("/").pop())
  await expect(page.getByRole("heading", { level: 1, name: LISTING.title })).toBeVisible()
  await expect(page.getByText(/retidos em custódia/)).toBeVisible()

  expect(await wallet(BUYER.id)).toEqual({ availableCents: LISTING.buyerFundsCents - LISTING.priceCents, heldCents: LISTING.priceCents })
  const [order] = await query<{ status: string; amountCents: number }>(`SELECT "status", "amountCents" FROM "order" WHERE "id" = $1`, [orderId])
  expect(order).toEqual({ status: "aguardando_entrega", amountCents: LISTING.priceCents })
  // a declaração de origem da conta foi gravada no chat do pedido
  const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM "order_message" WHERE "orderId" = $1 AND "authorRole" = 'system'`, [orderId])
  expect(n).toBeGreaterThan(0)
})

test("o vendedor registra a entrega e o comprador vê os dados", async ({ page }) => {
  await sellerPage.goto(`/pedidos/${orderId}`)
  await sellerPage.getByLabel("Dados da entrega").fill("login: conta-e2e / senha: Segredo123")
  await sellerPage.getByRole("button", { name: "Registrar entrega" }).click()
  await expect.poll(async () => (await query<{ status: string }>(`SELECT "status" FROM "order" WHERE "id" = $1`, [orderId]))[0].status).toBe("entregue")

  // o segredo está cifrado no banco, mas o comprador o lê na tela do pedido
  const [{ deliveryPayload }] = await query<{ deliveryPayload: string }>(`SELECT "deliveryPayload" FROM "order" WHERE "id" = $1`, [orderId])
  expect(deliveryPayload).not.toContain("Segredo123")
  await page.goto(`/pedidos/${orderId}`)
  await expect(page.getByText("login: conta-e2e / senha: Segredo123")).toBeVisible()
  // conta de jogo: o passo a passo de segurança aparece antes de confirmar
  await expect(page.getByText(/senha/i).first()).toBeVisible()
})

test("o comprador confirma o recebimento: o vendedor é pago uma vez", async ({ page }) => {
  await page.goto(`/pedidos/${orderId}`)
  await page.getByRole("button", { name: "Confirmar recebimento" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar recebimento" }).click()
  await expect.poll(async () => (await query<{ status: string }>(`SELECT "status" FROM "order" WHERE "id" = $1`, [orderId]))[0].status).toBe("concluido")

  const [order] = await query<{ sellerNetCents: number; feeCents: number }>(`SELECT "sellerNetCents", "feeCents" FROM "order" WHERE "id" = $1`, [orderId])
  expect(order.sellerNetCents + order.feeCents).toBe(LISTING.priceCents)
  expect(await wallet(BUYER.id)).toEqual({ availableCents: LISTING.buyerFundsCents - LISTING.priceCents, heldCents: 0 })
  expect((await wallet(SELLER.id)).availableCents).toBe(order.sellerNetCents)
  const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM "wallet_transaction" WHERE "orderId" = $1 AND "kind" = 'venda'`, [orderId])
  expect(n).toBe(1)
})

test("o comprador avalia e o vendedor responde publicamente", async ({ page }) => {
  await page.goto(`/pedidos/${orderId}`)
  await page.getByRole("button", { name: "5 estrelas" }).click()
  await page.getByLabel("Comentário da avaliação").fill("Entrega rápida, tudo certo.")
  await page.getByRole("button", { name: "Enviar avaliação" }).click()
  await expect(page.getByText("Avaliação registrada")).toBeVisible()

  await sellerPage.goto(`/pedidos/${orderId}`)
  await sellerPage.getByLabel("Responder (a resposta é pública)").fill("Obrigado pela compra, volte sempre!")
  await sellerPage.getByRole("button", { name: "Publicar resposta" }).click()
  await expect(sellerPage.getByText("Obrigado pela compra, volte sempre!")).toBeVisible()

  // a resposta aparece na página pública do anúncio, para qualquer visitante
  await page.context().clearCookies()
  await page.goto(`/produtos/${LISTING.slug}`)
  await expect(page.getByText("Entrega rápida, tudo certo.")).toBeVisible()
  await expect(page.getByText("Obrigado pela compra, volte sempre!")).toBeVisible()
})

test("no fim o dinheiro da plataforma fecha (a mesma conferência de produção)", async () => {
  const [{ total }] = await query<{ total: string }>(`SELECT COALESCE(SUM("availableCents" + "heldCents"), 0)::text AS total FROM "wallet"`)
  // só entrou o depósito do comprador; a compra apenas moveu o dinheiro entre carteiras e a taxa da plataforma
  const [{ fee }] = await query<{ fee: string }>(`SELECT COALESCE(SUM("feeCents"), 0)::text AS fee FROM "order" WHERE "status" = 'concluido'`)
  expect(Number(total) + Number(fee)).toBe(LISTING.buyerFundsCents)
})
