import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { htmlToText, renderHtml } from "@/lib/test-render"
import { encryptField } from "@/lib/secret-box"
import { creditAvailable, withTransaction } from "@/lib/wallet"

/**
 * As telas que exigem login — pedidos, disputa, carteira, painel do vendedor,
 * moderação — renderizadas de verdade. O foco é o controle de acesso: quem não
 * está logado vai para o login, quem não é parte do pedido recebe 404, nota
 * interna de disputa não chega às partes, só o administrador abre as telas de
 * administração e os dados de entrega só aparecem decifrados para quem pode.
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
  auth: { api: { getSession: async () => (holder.userId ? { user: { id: holder.userId } } : null) } },
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

import PedidosPage from "@/app/pedidos/page"
import PedidoPage from "@/app/pedidos/[id]/page"
import DisputaPage from "@/app/pedidos/[id]/disputa/page"
import CarteiraPage from "@/app/carteira/page"
import ContaPage from "@/app/conta/page"
import EntrarPage from "@/app/entrar/page"
import CadastroPage from "@/app/cadastro/page"
import PainelVendedorLayout from "@/app/painel/vendedor/layout"
import PainelVendedorPage from "@/app/painel/vendedor/page"
import AdminLayout from "@/app/admin/layout"
import CasoDisputaPage from "@/app/admin/disputas/[id]/page"
import ConferenciaPage from "@/app/admin/conferencia/page"
import CargosPage from "@/app/admin/usuarios/page"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

const KEY = Buffer.alloc(32, 7).toString("base64")

let productId: number
let variantId: number

beforeEach(async () => {
  holder.userId = null
  process.env.DELIVERY_ENCRYPTION_KEY = KEY
  await t.query(
    `TRUNCATE "dispute_message", "order_message", "wallet_transaction", "dispute", "review", "order", "product_variant", "product", "wallet", "seller_application", "profile", "user" RESTART IDENTITY CASCADE`,
  )
  await t.query(`SELECT setval(pg_get_serial_sequence('"order"', 'id'), 100)`)
  const user = (id: string, name: string, display: string | null, role = "user") =>
    t.query(`INSERT INTO "user" ("id", "name", "email", "displayName", "role", "emailVerified") VALUES ($1, $2, $1 || '@teste.dev', $3, $4, true)`, [id, name, display, role])
  await user("ana", "Ana Maria da Silva", "AnaGames")
  await user("comprador", "Carlos Pereira Lima", "CarlosPlay")
  await user("outro", "Outro Usuario", "OutroUser")
  await user("mod", "Moderadora Legal", "ModX", "moderator")
  await user("adm", "Admin Legal", "AdmX", "admin")
  await t.query(`INSERT INTO "seller_application" ("userId", "storeName", "storeSlug", "level", "status") VALUES ('ana', 'Loja da Ana', 'loja-da-ana', 4, 'aprovado')`)
  const p = await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game") VALUES ('ana', 'conta-valorant', 'Conta Valorant', 'contas', 'Valorant') RETURNING "id"`)
  productId = p.rows[0].id as number
  const v = await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Imortal', 10000, 3) RETURNING "id"`, [productId])
  variantId = v.rows[0].id as number
})

afterEach(() => {
  delete process.env.DELIVERY_ENCRYPTION_KEY
})

async function addOrder(opts: { buyer?: string; status?: string; title?: string; payload?: string | null } = {}) {
  const { rows } = await t.query(
    `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents", "status")
     VALUES ($1, 'ana', $2, $3, $4, 'Imortal', 10000, 800, 9200, $5) RETURNING "id"`,
    [opts.buyer ?? "comprador", productId, variantId, opts.title ?? "Conta Valorant", opts.status ?? "entregue"],
  )
  const id = rows[0].id as number
  if (opts.payload) {
    await t.query(`UPDATE "order" SET "deliveryPayload" = $2 WHERE "id" = $1`, [id, encryptField(opts.payload, `order:${id}`)])
  }
  return id
}

async function addDispute(orderId: number) {
  const { rows } = await t.query(
    `INSERT INTO "dispute" ("orderId", "openedBy", "reason", "description", "status", "firstContactDueAt", "sellerResponseDueAt", "resolutionDueAt")
     VALUES ($1, 'comprador', 'diferente', 'A conta veio diferente', 'em_analise', now() + interval '1 day', now() + interval '2 days', now() + interval '3 days') RETURNING "id"`,
    [orderId],
  )
  const id = rows[0].id as number
  await t.query(`INSERT INTO "dispute_message" ("disputeId", "authorId", "authorRole", "body", "internal") VALUES ($1, 'comprador', 'buyer', 'Relato do comprador', false)`, [id])
  await t.query(`INSERT INTO "dispute_message" ("disputeId", "authorId", "authorRole", "body", "internal") VALUES ($1, 'mod', 'moderator', 'NOTA INTERNA suspeita de golpe', true)`, [id])
  return id
}

const as = (id: string | null) => {
  holder.userId = id
}
const props = <T,>(p: T) => ({ params: Promise.resolve(p) })
const sp = <T,>(q: T) => ({ searchParams: Promise.resolve(q) })
const render = async (node: Promise<React.ReactNode> | React.ReactNode) => renderHtml(await node)
const txt = async (node: Promise<React.ReactNode> | React.ReactNode) => htmlToText(await render(node))

/* ---------------------------------------------------------------------------
 * Quem não está logado vai para o login
 * ------------------------------------------------------------------------ */

describe("sem login", () => {
  it("telas privadas redirecionam para /entrar", async () => {
    const id = await addOrder()
    await expect(PedidosPage(sp({}))).rejects.toThrow("NEXT_REDIRECT:/entrar")
    await expect(PedidoPage(props({ id: String(id) }))).rejects.toThrow("NEXT_REDIRECT:/entrar")
    await expect(DisputaPage(props({ id: String(id) }))).rejects.toThrow("NEXT_REDIRECT:/entrar")
    await expect(CarteiraPage(sp({}))).rejects.toThrow("NEXT_REDIRECT:/entrar")
    await expect(ContaPage()).rejects.toThrow("NEXT_REDIRECT:/entrar")
    await expect(PainelVendedorPage()).rejects.toThrow("NEXT_REDIRECT:/entrar")
    await expect(PainelVendedorLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/entrar")
  })

  it("moderação: sem login (ou comum) o layout manda para a home; as telas pedem cargo", async () => {
    await expect(AdminLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/")
    as("comprador")
    await expect(AdminLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/")
    await expect(CasoDisputaPage(props({ id: "1" }))).rejects.toThrow("Acesso restrito à moderação")
  })

  it("login e cadastro, já logado, levam para /conta", async () => {
    as("comprador")
    await expect(EntrarPage(sp({}))).rejects.toThrow("NEXT_REDIRECT:/conta")
    await expect(CadastroPage()).rejects.toThrow("NEXT_REDIRECT:/conta")
  })

  it("entrar e cadastro, sem login, abrem normalmente", async () => {
    expect(await txt(EntrarPage(sp({})))).toContain("Continuar com Google")
    expect(await render(CadastroPage())).toContain('id="conteudo"')
  })
})

/* ---------------------------------------------------------------------------
 * Pedidos
 * ------------------------------------------------------------------------ */

describe("lista de pedidos", () => {
  it("o comprador vê só os próprios pedidos", async () => {
    await addOrder({ title: "Meu Pedido Visível" })
    await addOrder({ buyer: "outro", title: "Pedido Alheio Secreto" })
    as("comprador")
    const t1 = await txt(PedidosPage(sp({})))
    expect(t1).toContain("Meu Pedido Visível")
    expect(t1).not.toContain("Pedido Alheio Secreto")
  })

  it("mostra a loja pelo nome público, nunca o nome legal do vendedor", async () => {
    await addOrder()
    as("comprador")
    const t1 = await txt(PedidosPage(sp({})))
    expect(t1).toContain("Loja da Ana")
    expect(t1).not.toContain("Ana Maria da Silva")
  })

  it("filtro de status chega da URL", async () => {
    await addOrder({ title: "Pedido Entregue", status: "entregue" })
    await addOrder({ title: "Pedido Cancelado", status: "cancelado" })
    as("comprador")
    const t1 = await txt(PedidosPage(sp({ status: "cancelado" })))
    expect(t1).toContain("Pedido Cancelado")
    expect(t1).not.toContain("Pedido Entregue")
  })
})

describe("detalhe do pedido", () => {
  it("id que não é número: 404", async () => {
    as("comprador")
    await expect(PedidoPage(props({ id: "abc" }))).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(PedidoPage(props({ id: "1.5" }))).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("quem não é parte (nem moderação) recebe 404, inclusive para pedido inexistente", async () => {
    const id = await addOrder({ payload: "login: segredo123" })
    as("outro")
    await expect(PedidoPage(props({ id: String(id) }))).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(PedidoPage(props({ id: "99999" }))).rejects.toThrow("NEXT_NOT_FOUND")
    as("ana") // vendedora de OUTRO pedido? não: é a dona deste; abaixo testamos outro vendedor
  })

  it("outro vendedor, mesmo com loja, não abre pedido alheio", async () => {
    await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ('bia', 'Bia', 'bia@teste.dev')`)
    await t.query(`INSERT INTO "seller_application" ("userId", "storeName", "storeSlug", "status") VALUES ('bia', 'Loja Bia', 'loja-bia', 'aprovado')`)
    const id = await addOrder()
    as("bia")
    await expect(PedidoPage(props({ id: String(id) }))).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("comprador e vendedor veem os dados de entrega DECIFRADOS", async () => {
    const id = await addOrder({ payload: "login: abc123 senha: segredo123" })
    for (const who of ["comprador", "ana"]) {
      as(who)
      const t1 = await txt(PedidoPage(props({ id: String(id) })))
      expect(t1).toContain("Dados da entrega")
      expect(t1).toContain("login: abc123 senha: segredo123")
      expect(t1).not.toContain("enc:v1:")
    }
  })

  it("moderação abre qualquer pedido, mas só lê os dados de entrega se houver disputa aberta", async () => {
    const id = await addOrder({ payload: "login: abc123" })
    as("mod")
    const semDisputa = await txt(PedidoPage(props({ id: String(id) })))
    expect(semDisputa).toContain("Conta Valorant")
    expect(semDisputa).not.toContain("Dados da entrega")
    expect(semDisputa).not.toContain("login: abc123")

    const disputeId = await addDispute(id)
    const comDisputa = await txt(PedidoPage(props({ id: String(id) })))
    expect(comDisputa).toContain("login: abc123")

    await t.query(`UPDATE "dispute" SET "status" = 'resolvida_vendedor' WHERE "id" = $1`, [disputeId])
    expect(await txt(PedidoPage(props({ id: String(id) })))).not.toContain("login: abc123")
  })

  it("sem dados de entrega, a seção não aparece", async () => {
    const id = await addOrder({ status: "aguardando_entrega" })
    as("comprador")
    expect(await txt(PedidoPage(props({ id: String(id) })))).not.toContain("Dados da entrega")
  })

  it("comprador vê a loja; vendedor vê o apelido do comprador; nunca o nome legal nem o email", async () => {
    const id = await addOrder()
    as("comprador")
    const comprador = await txt(PedidoPage(props({ id: String(id) })))
    expect(comprador).toContain("Loja da Ana")
    as("ana")
    const vendedor = await txt(PedidoPage(props({ id: String(id) })))
    expect(vendedor).toContain("CarlosPlay")
    for (const t1 of [comprador, vendedor]) {
      expect(t1).not.toContain("Carlos Pereira Lima")
      expect(t1).not.toContain("Ana Maria da Silva")
      expect(t1).not.toContain("@teste.dev")
    }
  })

  it("título do produto com HTML é escapado", async () => {
    const id = await addOrder({ title: "<img src=x onerror=alert(1)>" })
    as("comprador")
    const html = await render(PedidoPage(props({ id: String(id) })))
    expect(html).not.toContain("<img src=x")
  })
})

describe("disputa do pedido", () => {
  it("pedido sem disputa: 404; estranho: 404", async () => {
    const sem = await addOrder()
    const com = await addOrder({ status: "em_disputa" })
    await addDispute(com)
    as("comprador")
    await expect(DisputaPage(props({ id: String(sem) }))).rejects.toThrow("NEXT_NOT_FOUND")
    as("outro")
    await expect(DisputaPage(props({ id: String(com) }))).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("as partes NÃO veem a nota interna; a moderação vê", async () => {
    const id = await addOrder({ status: "em_disputa" })
    await addDispute(id)
    for (const who of ["comprador", "ana"]) {
      as(who)
      const t1 = await txt(DisputaPage(props({ id: String(id) })))
      expect(t1).toContain("Relato do comprador")
      expect(t1).not.toContain("NOTA INTERNA")
    }
    as("mod")
    const mod = await txt(DisputaPage(props({ id: String(id) })))
    expect(mod).toContain("Relato do comprador")
    expect(mod).toContain("NOTA INTERNA suspeita de golpe")
  })
})

/* ---------------------------------------------------------------------------
 * Carteira
 * ------------------------------------------------------------------------ */

describe("carteira", () => {
  it("mostra o saldo do usuário e só o extrato dele", async () => {
    await withTransaction((c) => creditAvailable(c, "comprador", 12345, "deposito", "Depósito de teste"))
    await withTransaction((c) => creditAvailable(c, "outro", 99999, "deposito", "Depósito alheio"))
    as("comprador")
    const t1 = await txt(CarteiraPage(sp({})))
    expect(t1).toContain("R$ 123,45")
    expect(t1).toContain("Depósito de teste")
    expect(t1).not.toContain("Depósito alheio")
    expect(t1).not.toContain("R$ 999,99")
  })
})

/* ---------------------------------------------------------------------------
 * Painel do vendedor
 * ------------------------------------------------------------------------ */

describe("painel do vendedor", () => {
  it("quem não é vendedor aprovado vai para /vender (layout e página)", async () => {
    as("comprador")
    await expect(PainelVendedorLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/vender")
    await expect(PainelVendedorPage()).rejects.toThrow("NEXT_REDIRECT:/vender")
    await t.query(`UPDATE "seller_application" SET "status" = 'em_andamento'`)
    as("ana")
    await expect(PainelVendedorLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/vender")
    await expect(PainelVendedorPage()).rejects.toThrow("NEXT_REDIRECT:/vender") // cadastro de loja ainda não aprovado
  })

  it("vendedor aprovado passa pelo layout e vê o painel com as vendas dele", async () => {
    await addOrder({ title: "Venda do Painel", status: "concluido" })
    as("ana")
    await expect(PainelVendedorLayout({ children: "ok" })).resolves.toBe("ok")
    const t1 = await txt(PainelVendedorPage())
    expect(t1).toContain("Painel")
    expect(t1).not.toContain("Ana Maria da Silva")
  })
})

/* ---------------------------------------------------------------------------
 * Moderação e administração
 * ------------------------------------------------------------------------ */

describe("moderação", () => {
  it("moderador e administrador passam pelo layout", async () => {
    for (const who of ["mod", "adm"]) {
      as(who)
      const html = await render(AdminLayout({ children: <p>conteudo-interno</p> }))
      expect(html).toContain("Moderação Ellowin")
      expect(html).toContain("conteudo-interno")
    }
  })

  it("só administrador vê Conferência e Cargos; moderador é mandado para as disputas", async () => {
    as("mod")
    await expect(ConferenciaPage()).rejects.toThrow("NEXT_REDIRECT:/admin/disputas")
    await expect(CargosPage()).rejects.toThrow("NEXT_REDIRECT:/admin/disputas")
    as("comprador")
    await expect(ConferenciaPage()).rejects.toThrow("NEXT_REDIRECT:/admin/disputas")
    await expect(CargosPage()).rejects.toThrow("NEXT_REDIRECT:/admin/disputas")
    as("adm")
    expect(await txt(CargosPage())).toContain("Cargos")
    expect(await txt(ConferenciaPage())).toContain("Conferência da carteira")
  })

  it("a conferência mostra 'Tudo bate' num banco consistente", async () => {
    as("adm")
    expect(await txt(ConferenciaPage())).toContain("Tudo bate")
  })

  it("caso de disputa: a moderação vê as notas internas e os dados das partes", async () => {
    const orderId = await addOrder({ status: "em_disputa" })
    const disputeId = await addDispute(orderId)
    as("mod")
    const t1 = await txt(CasoDisputaPage(props({ id: String(disputeId) })))
    expect(t1).toContain("NOTA INTERNA suspeita de golpe")
    expect(t1).toContain("Relato do comprador")
    expect(t1).toContain("Conta Valorant")
  })

  it("caso de disputa: dados de entrega só enquanto a disputa está aberta", async () => {
    const orderId = await addOrder({ status: "em_disputa", payload: "login: abc123 senha: segredo" })
    const disputeId = await addDispute(orderId)
    as("mod")
    expect(await txt(CasoDisputaPage(props({ id: String(disputeId) })))).toContain("login: abc123 senha: segredo")
    await t.query(`UPDATE "dispute" SET "status" = 'cancelada' WHERE "id" = $1`, [disputeId])
    expect(await txt(CasoDisputaPage(props({ id: String(disputeId) })))).not.toContain("segredo")
  })

  it("caso inexistente ou id inválido: 404", async () => {
    as("mod")
    await expect(CasoDisputaPage(props({ id: "999" }))).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(CasoDisputaPage(props({ id: "abc" }))).rejects.toThrow("NEXT_NOT_FOUND")
  })
})
