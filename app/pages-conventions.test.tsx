import type { ReactNode } from "react"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { htmlToText, renderHtml } from "@/lib/test-render"

/**
 * Convenções do projeto que valem para TODA tela (ver CLAUDE.md): um `<main
 * id="conteudo">` (alvo do "pular para o conteúdo"), um único `<h1>`, imagens com
 * `alt` e nenhum valor quebrado (`undefined`, `NaN`, `[object Object]`) no texto.
 * Cada tela é montada de verdade contra um banco com dados realistas; quem
 * esquecer uma convenção numa tela nova quebra aqui.
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
  googleEnabled: true,
  auth: {
    api: {
      getSession: async () => {
        if (!holder.userId) return null
        const { rows } = await holder.pool.query(`SELECT "id", "name", "email", "emailVerified" FROM "user" WHERE "id" = $1`, [holder.userId])
        return rows[0] ? { user: rows[0] } : null
      },
    },
  },
}))
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-nonce": "nonce-de-teste" }),
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("next/server", () => ({ after: () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/notify", () => ({ notifyOrder: () => {}, notifyQuestion: () => {}, notificationsLive: () => false }))
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }))
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }))

import HomePage from "@/app/page"
import ProductPage from "@/app/produtos/[slug]/page"
import LojaPage from "@/app/loja/[slug]/page"
import BuscaPage from "@/app/busca/page"
import CatalogPage from "@/app/catalogo/[slug]/page"
import JogosPage from "@/app/jogos/page"
import JogoPage from "@/app/jogos/[slug]/page"
import AjudaPage from "@/app/ajuda/page"
import TermosPage from "@/app/termos/page"
import VerificadorPage from "@/app/verificador/page"
import EntrarPage from "@/app/entrar/page"
import CadastroPage from "@/app/cadastro/page"
import EsqueciSenhaPage from "@/app/esqueci-senha/page"
import RedefinirSenhaPage from "@/app/redefinir-senha/page"
import ContaPage from "@/app/conta/page"
import CompletarCadastroPage from "@/app/completar-cadastro/page"
import VerificarEmailPage from "@/app/verificar-email/page"
import VenderPage from "@/app/vender/page"
import CarteiraPage from "@/app/carteira/page"
import PedidosPage from "@/app/pedidos/page"
import PedidoPage from "@/app/pedidos/[id]/page"
import DisputaPage from "@/app/pedidos/[id]/disputa/page"
import PainelPage from "@/app/painel/vendedor/page"
import PainelAnalisesPage from "@/app/painel/vendedor/analises/page"
import PainelPerguntasPage from "@/app/painel/vendedor/perguntas/page"
import PainelProdutosPage from "@/app/painel/vendedor/produtos/page"
import PainelProdutoPage from "@/app/painel/vendedor/produtos/[id]/page"
import PainelNovoProdutoPage from "@/app/painel/vendedor/produtos/novo/page"
import PainelEstoquePage from "@/app/painel/vendedor/produtos/[id]/estoque/page"
import PainelAvaliacoesPage from "@/app/painel/vendedor/avaliacoes/page"
import PainelLotePage from "@/app/painel/vendedor/produtos/lote/page"
import PainelVendasPage from "@/app/painel/vendedor/vendas/page"
import AdminLayout from "@/app/admin/layout"
import AdminDisputasPage from "@/app/admin/disputas/page"
import AdminDisputaPage from "@/app/admin/disputas/[id]/page"
import AdminDenunciasPage from "@/app/admin/denuncias/page"
import AdminDenunciaPage from "@/app/admin/denuncias/[id]/page"
import AdminConferenciaPage from "@/app/admin/conferencia/page"
import AdminUsuariosPage from "@/app/admin/usuarios/page"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

const ids = { product: 0, order: 0, dispute: 0, report: 0 }

beforeEach(async () => {
  holder.userId = null
  await t.query(
    `TRUNCATE "report", "product_question", "review", "dispute_message", "order_message", "dispute", "order", "product_image", "product_variant", "product", "wallet_transaction", "wallet", "seller_application", "profile", "user" RESTART IDENTITY CASCADE`,
  )
  await t.query(`SELECT setval(pg_get_serial_sequence('"order"', 'id'), 100)`)
  const person = async (id: string, name: string, display: string | null, role = "user", verified = true) => {
    await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName", "role", "emailVerified") VALUES ($1, $2, $1 || '@teste.dev', $3, $4, $5)`, [id, name, display, role, verified])
    await t.query(`INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "birthDate", "cpfVerified", "phoneVerified") VALUES ($1, $2, '52998224725', '11945678901', '01/01/1990', true, true)`, [id, name])
  }
  await person("ana", "Ana Maria da Silva", "AnaGames")
  await person("comprador", "Carlos Pereira Lima", "CarlosPlay")
  await person("mod", "Moderadora Legal", "ModX", "moderator")
  await person("adm", "Admin Legal", "AdmX", "admin")
  await person("novato", "Novo Usuario Teste", null, "user", false)
  await t.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES ('google', 'Gustavo Google', 'google@teste.dev', true)`) // entrou pelo Google, sem CPF/telefone
  await t.query(
    `INSERT INTO "seller_application" ("userId", "storeName", "storeSlug", "level", "status", "currentStep", "documentNumber", "pixKey", "pixKeyType") VALUES ('ana', 'Loja da Ana', 'loja-da-ana', 4, 'aprovado', 5, '52998224725', '52998224725', 'cpf')`,
  )
  const p = await t.query(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game", "description", "attributes", "ratingSum", "ratingCount") VALUES ('ana', 'conta-valorant', 'Conta Valorant Imortal', 'contas', 'Valorant', 'Conta completa com skins', '{"regiao":"br","rank":"imortal"}'::jsonb, 5, 1) RETURNING "id"`,
  )
  ids.product = p.rows[0].id as number
  await t.query(`INSERT INTO "product_image" ("productId", "url", "sortOrder") VALUES ($1, 'https://example.public.blob.vercel-storage.com/capa.webp', 0)`, [ids.product])
  const v = await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Imortal', 25000, 3) RETURNING "id"`, [ids.product])
  const o = await t.query(
    `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents", "status", "deliveryPayload") VALUES ('comprador', 'ana', $1, $2, 'Conta Valorant Imortal', 'Imortal', 25000, 2000, 23000, 'em_disputa', 'login: abc') RETURNING "id"`,
    [ids.product, v.rows[0].id],
  )
  ids.order = o.rows[0].id as number
  const d = await t.query(
    `INSERT INTO "dispute" ("orderId", "openedBy", "reason", "description", "status", "firstContactDueAt", "sellerResponseDueAt", "resolutionDueAt") VALUES ($1, 'comprador', 'diferente', 'Veio diferente', 'em_analise', now() + interval '1 day', now() + interval '2 days', now() + interval '3 days') RETURNING "id"`,
    [ids.order],
  )
  ids.dispute = d.rows[0].id as number
  await t.query(`INSERT INTO "dispute_message" ("disputeId", "authorId", "authorRole", "body") VALUES ($1, 'comprador', 'buyer', 'Relato')`, [ids.dispute])
  await t.query(`INSERT INTO "order_message" ("orderId", "authorId", "authorRole", "body") VALUES ($1, 'comprador', 'buyer', 'Oi')`, [ids.order])
  await t.query(`INSERT INTO "product_question" ("productId", "askerId", "question") VALUES ($1, 'comprador', 'Tem garantia?')`, [ids.product])
  const r = await t.query(
    `INSERT INTO "report" ("reporterId", "targetType", "targetProductId", "reason", "description") VALUES ('comprador', 'anuncio', $1, 'golpe', 'Parece golpe') RETURNING "id"`,
    [ids.product],
  )
  ids.report = r.rows[0].id as number
  await t.query(`INSERT INTO "wallet" ("userId", "availableCents", "heldCents") VALUES ('ana', 5000, 0), ('comprador', 0, 25000)`)
})

const params = <T,>(p: T) => ({ params: Promise.resolve(p) })
const sp = <T,>(q: T) => ({ searchParams: Promise.resolve(q) })

type Screen = { name: string; as: string | null; render: () => Promise<ReactNode> | ReactNode; admin?: boolean }

const screens: Screen[] = [
  // públicas
  { name: "home", as: null, render: () => HomePage() },
  { name: "anúncio", as: null, render: () => ProductPage(params({ slug: "conta-valorant" })) },
  { name: "anúncio (logado)", as: "comprador", render: () => ProductPage(params({ slug: "conta-valorant" })) },
  { name: "loja", as: null, render: () => LojaPage(params({ slug: "loja-da-ana" })) },
  { name: "busca", as: null, render: () => BuscaPage(sp({ q: "valorant" })) },
  { name: "busca vazia", as: null, render: () => BuscaPage(sp({})) },
  { name: "categoria", as: null, render: () => CatalogPage({ ...params({ slug: "contas" }), ...sp({}) }) },
  { name: "índice de jogos", as: null, render: () => JogosPage() },
  { name: "jogo", as: null, render: () => JogoPage({ ...params({ slug: "valorant" }), ...sp({}) }) },
  { name: "ajuda", as: null, render: () => AjudaPage() },
  { name: "termos", as: null, render: () => TermosPage() },
  { name: "verificador", as: null, render: () => VerificadorPage(sp({ loja: "loja-da-ana" })) },
  { name: "entrar", as: null, render: () => EntrarPage(sp({})) },
  { name: "cadastro", as: null, render: () => CadastroPage() },
  { name: "esqueci a senha", as: null, render: () => EsqueciSenhaPage() },
  { name: "redefinir senha (com token)", as: null, render: () => RedefinirSenhaPage(sp({ token: "abc" })) },
  { name: "redefinir senha (link inválido)", as: null, render: () => RedefinirSenhaPage(sp({})) },
  // conta
  { name: "minha conta", as: "comprador", render: () => ContaPage() },
  { name: "completar cadastro", as: "google", render: () => CompletarCadastroPage(sp({})) },
  { name: "verificar e-mail", as: "novato", render: () => VerificarEmailPage(sp({})) },
  { name: "cadastro de vendedor", as: "comprador", render: () => VenderPage() },
  { name: "carteira", as: "comprador", render: () => CarteiraPage(sp({})) },
  { name: "meus pedidos", as: "comprador", render: () => PedidosPage(sp({})) },
  { name: "pedido", as: "comprador", render: () => PedidoPage(params({ id: String(ids.order) })) },
  { name: "disputa do pedido", as: "comprador", render: () => DisputaPage(params({ id: String(ids.order) })) },
  // painel do vendedor
  { name: "painel do vendedor", as: "ana", render: () => PainelPage() },
  { name: "painel: análises", as: "ana", render: () => PainelAnalisesPage(sp({})) },
  { name: "painel: análises (90 dias)", as: "ana", render: () => PainelAnalisesPage(sp({ periodo: "90" })) },
  { name: "painel: perguntas", as: "ana", render: () => PainelPerguntasPage(sp({})) },
  { name: "painel: meus anúncios", as: "ana", render: () => PainelProdutosPage(sp({})) },
  { name: "painel: editar anúncio", as: "ana", render: () => PainelProdutoPage(params({ id: String(ids.product) })) },
  { name: "painel: novo anúncio", as: "ana", render: () => PainelNovoProdutoPage(sp({})) },
  { name: "painel: estoque do anúncio", as: "ana", render: () => PainelEstoquePage(params({ id: String(ids.product) })) },
  { name: "painel: avaliações recebidas", as: "ana", render: () => PainelAvaliacoesPage(sp({})) },
  { name: "painel: editar em lote", as: "ana", render: () => PainelLotePage(sp({})) },
  { name: "painel: vendas", as: "ana", render: () => PainelVendasPage(sp({})) },
  // moderação (dentro do layout, que traz o <main>)
  { name: "moderação: fila de disputas", as: "adm", admin: true, render: () => AdminDisputasPage(sp({})) },
  { name: "moderação: caso de disputa", as: "adm", admin: true, render: () => AdminDisputaPage(params({ id: String(ids.dispute) })) },
  { name: "moderação: fila de denúncias", as: "adm", admin: true, render: () => AdminDenunciasPage(sp({})) },
  { name: "moderação: caso de denúncia", as: "adm", admin: true, render: () => AdminDenunciaPage(params({ id: String(ids.report) })) },
  { name: "moderação: conferência", as: "adm", admin: true, render: () => AdminConferenciaPage() },
  { name: "moderação: cargos", as: "adm", admin: true, render: () => AdminUsuariosPage() },
]

async function htmlOf(screen: Screen) {
  holder.userId = screen.as
  const page = await screen.render()
  const node = screen.admin ? await AdminLayout({ children: page }) : page
  return renderHtml(node)
}

describe.each(screens)("convenções: $name", (screen) => {
  it('tem exatamente um <main id="conteudo">', async () => {
    const html = await htmlOf(screen)
    expect(html.match(/<main[^>]*id="conteudo"/g) ?? []).toHaveLength(1)
    expect(html.match(/<main[\s>]/g) ?? []).toHaveLength(1)
  })

  it("tem um único <h1>", async () => {
    const html = await htmlOf(screen)
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1)
  })

  it("toda imagem tem atributo alt", async () => {
    const html = await htmlOf(screen)
    const imgs = html.match(/<img\b[^>]*>/g) ?? []
    for (const img of imgs) expect(img, img).toMatch(/\balt=/)
  })

  it("nenhum valor quebrado no texto (undefined, NaN, [object Object], null)", async () => {
    const text = htmlToText(await htmlOf(screen))
    expect(text).not.toMatch(/\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/)
  })

  it("todo link tem destino (href)", async () => {
    const html = await htmlOf(screen)
    for (const a of html.match(/<a\b[^>]*>/g) ?? []) expect(a, a).toMatch(/\bhref=/)
  })
})
