import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"
import { htmlToText, renderHtml } from "@/lib/test-render"
import { creditAvailable, withTransaction } from "@/lib/wallet"

/**
 * Cadastro, conta e telas de verificação, renderizadas de verdade: o que cada
 * pessoa vê em "Minha conta", o desvio de quem entrou pelo Google sem CPF, o
 * redirecionamento seguro (`?next=`), a redefinição de senha e o verificador
 * público de lojas.
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
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }))
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }))

import ContaPage from "@/app/conta/page"
import CompletarCadastroPage from "@/app/completar-cadastro/page"
import VerificarEmailPage from "@/app/verificar-email/page"
import RedefinirSenhaPage, { metadata as redefinirMetadata } from "@/app/redefinir-senha/page"
import EsqueciSenhaPage from "@/app/esqueci-senha/page"
import VenderPage from "@/app/vender/page"
import VerificadorPage from "@/app/verificador/page"
import AjudaPage from "@/app/ajuda/page"
import TermosPage from "@/app/termos/page"
import { AUTO_RELEASE_DAYS } from "@/lib/money"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb()
  holder.db = t.db
  holder.pool = t.pool
}, 60_000)

afterAll(async () => {
  await t.close()
})

beforeEach(async () => {
  holder.userId = null
  await t.query(
    `TRUNCATE "seller_account_flag", "dispute", "order", "product_variant", "product", "wallet_transaction", "wallet", "seller_application", "profile", "user" RESTART IDENTITY CASCADE`,
  )
})

async function addUser(
  id: string,
  opts: {
    name?: string
    display?: string | null
    emailVerified?: boolean
    profile?: boolean
    phoneVerified?: boolean
    bio?: string | null
  } = {},
) {
  await t.query(`INSERT INTO "user" ("id", "name", "email", "displayName", "emailVerified", "bio") VALUES ($1, $2, $1 || '@teste.dev', $3, $4, $5)`, [
    id,
    opts.name ?? "Maria da Silva",
    opts.display === undefined ? null : opts.display,
    opts.emailVerified ?? true,
    opts.bio ?? null,
  ])
  if (opts.profile !== false) {
    await t.query(
      `INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "birthDate", "cpfVerified", "phoneVerified") VALUES ($1, $2, '52998224725', '11945678901', '01/01/1990', true, $3)`,
      [id, opts.name ?? "Maria da Silva", opts.phoneVerified ?? false],
    )
  }
}

const as = (id: string | null) => {
  holder.userId = id
}
const sp = <T,>(q: T) => ({ searchParams: Promise.resolve(q) })
const render = async (node: Promise<React.ReactNode> | React.ReactNode) => renderHtml(await node)
const txt = async (node: Promise<React.ReactNode> | React.ReactNode) => htmlToText(await render(node))

/* ---------------------------------------------------------------------------
 * Minha conta
 * ------------------------------------------------------------------------ */

describe("minha conta", () => {
  it("quem entrou pelo Google sem CPF/telefone é levado a completar o cadastro", async () => {
    await addUser("google", { profile: false })
    as("google")
    await expect(ContaPage()).rejects.toThrow("NEXT_REDIRECT:/completar-cadastro?next=/conta")
  })

  it("com CPF mas sem telefone (ou o contrário) também completa o cadastro antes", async () => {
    await addUser("semfone")
    await t.query(`UPDATE "profile" SET "phone" = NULL WHERE "userId" = 'semfone'`)
    as("semfone")
    await expect(ContaPage()).rejects.toThrow("NEXT_REDIRECT:/completar-cadastro?next=/conta")
    await addUser("semcpf")
    await t.query(`UPDATE "profile" SET "cpf" = NULL WHERE "userId" = 'semcpf'`)
    as("semcpf")
    await expect(ContaPage()).rejects.toThrow("NEXT_REDIRECT:/completar-cadastro?next=/conta")
  })

  it("mostra o primeiro nome (ou o apelido), e-mail, CPF formatado e o nome completo", async () => {
    await addUser("maria", { name: "Maria da Silva" })
    as("maria")
    const t1 = await txt(ContaPage())
    expect(t1).toContain("Olá, Maria")
    expect(t1).not.toContain("Olá, Maria da") // só o primeiro nome na saudação
    expect(t1).toContain("maria@teste.dev")
    expect(t1).toContain("529.982.247-25")
    expect(t1).toContain("Maria da Silva")
    expect(t1).toContain("Validado no cadastro")
  })

  it("com apelido, a saudação usa o apelido", async () => {
    await addUser("maria", { display: "MariaGamer" })
    as("maria")
    expect(await txt(ContaPage())).toContain("Olá, MariaGamer")
  })

  it("progresso da verificação sobe conforme as etapas (CPF validado + e-mail = 40%; + telefone = 60%)", async () => {
    await addUser("maria", { emailVerified: true, phoneVerified: false })
    as("maria")
    expect(await txt(ContaPage())).toContain("40% verificada")
    await t.query(`UPDATE "profile" SET "phoneVerified" = true`)
    expect(await txt(ContaPage())).toContain("60% verificada")
  })

  it("e-mail não verificado baixa o progresso", async () => {
    await addUser("maria", { emailVerified: false })
    as("maria")
    expect(await txt(ContaPage())).toContain("20% verificada")
  })

  it("conta de vendedor: sem cadastro, em andamento e aprovado", async () => {
    await addUser("maria")
    as("maria")
    expect(await txt(ContaPage())).toContain("Você ainda não é vendedor")

    await t.query(`INSERT INTO "seller_application" ("userId", "status", "currentStep", "storeName", "storeSlug") VALUES ('maria', 'em_andamento', 3, 'Loja Maria', 'loja-maria')`)
    const andamento = await txt(ContaPage())
    expect(andamento).toContain("você parou na etapa 3 de 5")
    expect(andamento).toContain("Continuar cadastro")
    expect(andamento).not.toContain("Ver minha loja pública")

    await t.query(`UPDATE "seller_application" SET "status" = 'aprovado', "level" = 2`)
    const aprovado = await txt(ContaPage())
    expect(aprovado).toContain("Loja Maria")
    expect(aprovado).toContain("Nível 2")
    expect(aprovado).toContain("Ver minha loja pública")
  })

  it("exclusão de conta: avisa o que bloqueia (saldo na carteira) e some quando não há bloqueio", async () => {
    await addUser("maria")
    as("maria")
    const livre = await txt(ContaPage())
    expect(livre).not.toContain("saldo na carteira")
    await withTransaction((c) => creditAvailable(c, "maria", 5000, "deposito", "Depósito"))
    expect(await txt(ContaPage())).toContain("saldo na carteira")
  })

  it("não mostra dados de outra pessoa", async () => {
    await addUser("maria")
    await addUser("joao", { name: "Joao Pereira Souza" })
    as("maria")
    const t1 = await txt(ContaPage())
    expect(t1).not.toContain("Joao Pereira Souza")
    expect(t1).not.toContain("joao@teste.dev")
  })

  it("bio com HTML vai como valor do campo, nunca como marcação", async () => {
    await addUser("maria", { bio: '</textarea><script>alert(1)</script>' })
    as("maria")
    const html = await render(ContaPage())
    expect(html).not.toContain("<script>alert(1)")
  })
})

/* ---------------------------------------------------------------------------
 * Completar cadastro, verificar e-mail, senha
 * ------------------------------------------------------------------------ */

describe("completar cadastro", () => {
  it("sem login vai para /entrar", async () => {
    await expect(CompletarCadastroPage(sp({}))).rejects.toThrow("NEXT_REDIRECT:/entrar")
  })

  it("cadastro incompleto mostra o formulário com o nome e o e-mail do Google", async () => {
    await addUser("google", { name: "Gustavo Google", profile: false })
    as("google")
    const html = await render(CompletarCadastroPage(sp({})))
    expect(htmlToText(html)).toContain("google@teste.dev")
    expect(html).toContain("Gustavo Google")
  })

  it("cadastro completo vai direto ao destino; destino externo ou protocolo-relativo cai em /conta", async () => {
    await addUser("maria")
    as("maria")
    await expect(CompletarCadastroPage(sp({ next: "/vender" }))).rejects.toThrow("NEXT_REDIRECT:/vender")
    await expect(CompletarCadastroPage(sp({}))).rejects.toThrow("NEXT_REDIRECT:/conta")
    await expect(CompletarCadastroPage(sp({ next: "https://evil.com" }))).rejects.toThrow("NEXT_REDIRECT:/conta")
    await expect(CompletarCadastroPage(sp({ next: "//evil.com" }))).rejects.toThrow("NEXT_REDIRECT:/conta")
    await expect(CompletarCadastroPage(sp({ next: "/\\evil.com" }))).rejects.toThrow("NEXT_REDIRECT:/conta")
  })
})

describe("verificar e-mail", () => {
  it("sem login vai para /entrar", async () => {
    await expect(VerificarEmailPage(sp({}))).rejects.toThrow("NEXT_REDIRECT:/entrar")
  })

  it("e-mail já confirmado segue para o destino seguro", async () => {
    await addUser("maria", { emailVerified: true })
    as("maria")
    await expect(VerificarEmailPage(sp({ next: "/pedidos" }))).rejects.toThrow("NEXT_REDIRECT:/pedidos")
    await expect(VerificarEmailPage(sp({ next: "//evil.com" }))).rejects.toThrow("NEXT_REDIRECT:/conta")
  })

  it("e-mail não confirmado mostra a tela do código", async () => {
    await addUser("maria", { emailVerified: false })
    as("maria")
    const t1 = await txt(VerificarEmailPage(sp({})))
    expect(t1).toContain("maria@teste.dev")
  })
})

describe("redefinir senha", () => {
  it("sem token: 'Link inválido' e caminho para pedir outro", async () => {
    const html = await render(RedefinirSenhaPage(sp({})))
    expect(htmlToText(html)).toContain("Link inválido")
    expect(html).toContain('href="/esqueci-senha"')
  })

  it("com token: mostra o formulário, não o aviso de link inválido", async () => {
    const t1 = await txt(RedefinirSenhaPage(sp({ token: "abc123" })))
    expect(t1).not.toContain("Link inválido")
  })

  it("fora do índice dos buscadores (o token está na URL)", () => {
    expect(redefinirMetadata.robots).toEqual({ index: false, follow: false })
  })

  it("'esqueci a senha', já logado, vai para /conta", async () => {
    await addUser("maria")
    as("maria")
    await expect(EsqueciSenhaPage()).rejects.toThrow("NEXT_REDIRECT:/conta")
  })
})

/* ---------------------------------------------------------------------------
 * Cadastro de vendedor
 * ------------------------------------------------------------------------ */

describe("cadastro de vendedor", () => {
  it("sem login vai para o login com retorno para /vender", async () => {
    await expect(VenderPage()).rejects.toThrow("NEXT_REDIRECT:/entrar?next=/vender")
  })

  it("logado, mostra o assistente", async () => {
    await addUser("maria")
    as("maria")
    const t1 = await txt(VenderPage())
    expect(t1).toContain("Cadastro de vendedor")
  })
})

/* ---------------------------------------------------------------------------
 * Verificador público de lojas
 * ------------------------------------------------------------------------ */

describe("verificador de contas", () => {
  async function addStore(slug: string, status = "aprovado") {
    await addUser("ana", { name: "Ana Maria da Silva", display: "AnaGames" })
    await t.query(`INSERT INTO "seller_application" ("userId", "storeName", "storeSlug", "level", "status") VALUES ('ana', 'Loja da Ana', $1, 3, $2)`, [slug, status])
  }
  const verificar = (loja?: string) => txt(VerificadorPage(sp(loja === undefined ? {} : { loja })))

  it("sem consulta mostra só o formulário", async () => {
    const t1 = await verificar()
    expect(t1).toContain("Verificador de contas")
    expect(t1).not.toContain("Loja não encontrada")
  })

  it("loja sem registros recebe o selo; o nome legal não aparece", async () => {
    await addStore("loja-da-ana")
    const t1 = await verificar("loja-da-ana")
    expect(t1).toContain("Loja da Ana")
    expect(t1).toContain("Nível 3")
    expect(t1).toContain("nenhum registro de conta recuperada encontrado")
    expect(t1).not.toContain("Ana Maria da Silva")
  })

  it("aceita o link colado inteiro, com ou sem protocolo, e ignora o resto da URL", async () => {
    await addStore("loja-da-ana")
    for (const entrada of ["https://ellowin.com.br/loja/loja-da-ana", "ellowin.com.br/loja/loja-da-ana?x=1", "/loja/loja-da-ana#topo", "  loja-da-ana  "]) {
      expect(await verificar(entrada)).toContain("Loja da Ana")
    }
  })

  it("loja com registros de conta recuperada mostra a contagem e a data, sem detalhes do caso", async () => {
    await addStore("loja-da-ana")
    await t.query(`INSERT INTO "user" ("id", "name", "email") VALUES ('c', 'Comprador', 'c@teste.dev'), ('m', 'Mod', 'm@teste.dev')`)
    await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('ana', 'p', 'P', 'contas')`)
    await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES (1, 'x', 100, 1)`)
    await t.query(`INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "status") VALUES ('c', 'ana', 1, 1, 'x', 'y', 100, 'em_disputa')`)
    await t.query(`INSERT INTO "dispute" ("orderId", "openedBy", "reason", "firstContactDueAt", "sellerResponseDueAt", "resolutionDueAt") VALUES (1, 'c', 'diferente', now(), now(), now())`)
    await t.query(`INSERT INTO "seller_account_flag" ("sellerId", "disputeId", "moderatorId", "note") VALUES ('ana', 1, 'm', 'NOTA SIGILOSA DA MODERAÇÃO')`)
    const t1 = await verificar("loja-da-ana")
    expect(t1).toContain("1 registro de conta recuperada encontrado")
    expect(t1).not.toContain("Selo de Certificação")
    expect(t1).not.toContain("NOTA SIGILOSA")
  })

  it("loja inexistente ou de vendedor não aprovado: 'Loja não encontrada'", async () => {
    await addStore("loja-da-ana", "em_andamento")
    expect(await verificar("loja-da-ana")).toContain("Loja não encontrada")
    expect(await verificar("nao-existe")).toContain("Loja não encontrada")
  })

  it("a consulta digitada é escapada no formulário", async () => {
    const html = await render(VerificadorPage(sp({ loja: '"><script>alert(1)</script>' })))
    expect(html).not.toContain("<script>alert(1)")
  })
})

/* ---------------------------------------------------------------------------
 * Ajuda e termos
 * ------------------------------------------------------------------------ */

describe("ajuda e termos", () => {
  it("a central de ajuda monta com os tópicos e sem valores quebrados", async () => {
    const html = await render(AjudaPage())
    const t1 = htmlToText(html)
    expect(html).toContain('id="conteudo"')
    expect(t1).toContain("Central de ajuda")
    expect(t1).not.toContain("undefined")
    expect(t1).not.toContain("NaN")
  })

  it("os termos montam e trazem a seção de privacidade", async () => {
    const t1 = await txt(TermosPage())
    expect(t1).toContain("Termos de uso")
    expect(t1).toContain("Dados pessoais e privacidade")
  })

  it("os termos só prometem o que o sistema faz: liberação contada da entrega, sem níveis com limites nem central inexistente", async () => {
    const t1 = await txt(TermosPage())
    expect(t1).toContain(`${AUTO_RELEASE_DAYS} dias após a entrega`)
    expect(t1).not.toContain("prazo indicado no anúncio")
    expect(t1).not.toContain("novos limites")
    expect(t1).not.toContain("central de segurança")
  })
})
