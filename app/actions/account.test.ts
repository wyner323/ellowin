import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * Server actions de "Minha conta" (apelido, foto, bio, cor, banner) e a exclusão
 * (anonimização, LGPD) da própria conta, mais a neutralização de credenciais ao
 * juntar uma conta com o Google. Tudo contra um Postgres em memória com as
 * migrações reais; só a sessão, o cache do Next e o envio de e-mail são simulados.
 */

const holder = vi.hoisted(() => ({
  db: null as unknown as TestDb["db"],
  pool: null as unknown as TestDb["pool"],
  userId: null as string | null,
  ip: "203.0.113.7" as string | null,
  deletedEmails: [] as string[],
  deletedEmailFails: false,
  blobDeleted: [] as string[][],
  blobFails: false,
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
  auth: {
    api: {
      getSession: async () => {
        if (!holder.userId) return null
        const { rows } = await holder.pool.query(`SELECT "id", "email", "emailVerified" FROM "user" WHERE "id" = $1`, [holder.userId])
        return rows[0] ? { user: rows[0] } : null
      },
    },
  },
}))
vi.mock("next/headers", () => ({
  headers: async () => new Headers(holder.ip ? { "x-real-ip": holder.ip } : {}),
}))
vi.mock("next/server", () => ({ after: () => {} }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@vercel/blob", () => ({
  del: async (urls: string | string[]) => {
    if (holder.blobFails) throw new Error("Blob fora do ar")
    holder.blobDeleted.push(Array.isArray(urls) ? urls : [urls])
  },
}))
vi.mock("@/lib/email", () => ({
  sendAccountDeletedEmail: async (to: string) => {
    holder.deletedEmails.push(to)
    if (holder.deletedEmailFails) throw new Error("provedor fora do ar")
  },
}))

import {
  removeAvatar,
  removeBanner,
  requestAccountDeletion,
  updateAccentColor,
  updateAvatar,
  updateBanner,
  updateBio,
  updateDisplayName,
} from "@/app/actions/account"
import { getDeletionBlockers } from "@/lib/account-deletion"
import { getProductBySlug, getSellerStorefront } from "@/lib/marketplace"
import { neutralizeUnverifiedCredentials } from "@/lib/account-link"

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
  holder.ip = "203.0.113.7"
  holder.deletedEmails.length = 0
  holder.deletedEmailFails = false
  holder.blobDeleted.length = 0
  holder.blobFails = false
  await t.query(
    `TRUNCATE "auth_attempt", "review", "order", "product_variant", "product", "wallet_transaction", "wallet", "seller_application", "session", "account", "profile", "user" RESTART IDENTITY CASCADE`,
  )
  await addUser("ana", { displayName: "Ana_Gamer", bio: "Vendo contas", image: blobAvatar("ana"), banner: blobBanner("ana"), accent: "rosa" })
  await addUser("bia", { displayName: "Bia" })
})

/* ---------------------------------------------------------------------------
 * Apoio
 * ------------------------------------------------------------------------ */

const blobAvatar = (id: string, ext = "webp") => `https://abc123.public.blob.vercel-storage.com/avatars/${id}.${ext}?v=1`
const blobBanner = (id: string, ext = "webp") => `https://abc123.public.blob.vercel-storage.com/banners/${id}.${ext}?v=1`

async function addUser(
  id: string,
  opts: { displayName?: string; bio?: string; image?: string; banner?: string; accent?: string; role?: string; emailVerified?: boolean } = {},
) {
  await t.query(
    `INSERT INTO "user" ("id", "name", "email", "emailVerified", "displayName", "bio", "image", "bannerUrl", "accentColor", "role")
     VALUES ($1, 'Nome Legal ' || $1, $1 || '@teste.dev', $2, $3, $4, $5, $6, $7, $8)`,
    [id, opts.emailVerified ?? true, opts.displayName ?? null, opts.bio ?? null, opts.image ?? null, opts.banner ?? null, opts.accent ?? null, opts.role ?? "user"],
  )
  await t.query(
    `INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "phoneVerified", "birthDate") VALUES ($1, 'Nome Legal ' || $1, '52998224725', '11999991111', true, '01/01/1990')`,
    [id],
  )
}

async function rows(text: string, params?: unknown[]) {
  return (await t.query(text, params)).rows
}

const userRow = async (id: string) =>
  (await rows(`SELECT * FROM "user" WHERE "id" = $1`, [id]))[0] as {
    id: string
    name: string
    email: string
    emailVerified: boolean
    displayName: string | null
    bio: string | null
    image: string | null
    bannerUrl: string | null
    accentColor: string | null
    deletedAt: Date | null
  }

const profileRow = async (id: string) =>
  (await rows(`SELECT * FROM "profile" WHERE "userId" = $1`, [id]))[0] as {
    fullName: string
    cpf: string
    phone: string | null
    phoneVerified: boolean
  }

async function addWallet(userId: string, availableCents: number, heldCents: number) {
  await t.query(`INSERT INTO "wallet" ("userId", "availableCents", "heldCents") VALUES ($1, $2, $3)`, [userId, availableCents, heldCents])
}

/** Produto + item + pedido entre `buyerId` e `sellerId` no status dado. */
async function addOrder(buyerId: string, sellerId: string, status: string) {
  const { rows: p } = await t.query(
    `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "status") VALUES ($1, 'p-' || gen_random_uuid()::text, 'Conta', 'contas', 'pausado') RETURNING "id"`,
    [sellerId],
  )
  const { rows: v } = await t.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Item', 1000, 1) RETURNING "id"`, [p[0].id])
  const { rows: o } = await t.query(
    `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents", "status")
     VALUES ($1, $2, $3, $4, 'Conta', 'Item', 1000, 80, 920, $5) RETURNING "id"`,
    [buyerId, sellerId, p[0].id, v[0].id, status],
  )
  return { orderId: o[0].id as number, productId: p[0].id as number }
}

async function addListing(sellerId: string, status: string) {
  await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "status") VALUES ($1, 'p-' || gen_random_uuid()::text, 'Anúncio', 'contas', $2)`, [sellerId, status])
}

/* ---------------------------------------------------------------------------
 * Apelido
 * ------------------------------------------------------------------------ */

describe("updateDisplayName", () => {
  it("atualiza o apelido (sem espaços nas pontas) só da própria conta", async () => {
    holder.userId = "ana"
    expect(await updateDisplayName({ displayName: "  Ana Pro  " })).toMatchObject({ ok: true })
    expect((await userRow("ana")).displayName).toBe("Ana Pro")
    expect((await userRow("bia")).displayName).toBe("Bia")
  })

  it("exige estar logado", async () => {
    holder.userId = null
    await expect(updateDisplayName({ displayName: "Novo" })).rejects.toThrow("Não autenticado")
  })

  it("recusa apelido inválido sem mudar nada", async () => {
    holder.userId = "ana"
    for (const bad of ["a", "x".repeat(21), "ana<script>", "!!!", "   "]) {
      expect(await updateDisplayName({ displayName: bad }), bad).toMatchObject({ ok: false, field: "displayName" })
    }
    expect((await userRow("ana")).displayName).toBe("Ana_Gamer")
  })

  it("apelido de outra pessoa é recusado com mensagem amigável, sem diferenciar maiúsculas", async () => {
    holder.userId = "ana"
    for (const taken of ["Bia", "bia", "BIA"]) {
      expect(await updateDisplayName({ displayName: taken }), taken).toMatchObject({ ok: false, field: "displayName", error: "Esse apelido já está em uso. Escolha outro." })
    }
    expect((await userRow("ana")).displayName).toBe("Ana_Gamer")
  })

  it("o próprio apelido pode ser reenviado (e trocado só pela caixa)", async () => {
    holder.userId = "ana"
    expect((await updateDisplayName({ displayName: "Ana_Gamer" })).ok).toBe(true)
    expect((await updateDisplayName({ displayName: "ANA_GAMER" })).ok).toBe(true)
  })
})

/* ---------------------------------------------------------------------------
 * Foto, banner, bio e cor
 * ------------------------------------------------------------------------ */

describe("avatar e banner", () => {
  it("só aceita a URL do Blob da PRÓPRIA conta", async () => {
    holder.userId = "bia"
    const own = blobAvatar("bia", "png")
    expect(await updateAvatar({ imageUrl: own })).toMatchObject({ ok: true })
    expect((await userRow("bia")).image).toBe(own)

    for (const bad of [
      blobAvatar("ana"), // de outra conta
      "https://evil.example.com/avatars/bia.webp", // domínio de fora
      "http://abc123.public.blob.vercel-storage.com/avatars/bia.webp", // sem https
      blobBanner("bia"), // pasta errada
      "javascript:alert(1)",
      "",
    ]) {
      expect(await updateAvatar({ imageUrl: bad }), bad).toMatchObject({ ok: false })
    }
    expect((await userRow("bia")).image).toBe(own)
  })

  it("banner segue a mesma regra e removeAvatar/removeBanner limpam", async () => {
    holder.userId = "bia"
    expect(await updateBanner({ imageUrl: blobBanner("ana") })).toMatchObject({ ok: false })
    expect(await updateBanner({ imageUrl: blobAvatar("bia") })).toMatchObject({ ok: false })
    expect(await updateBanner({ imageUrl: blobBanner("bia") })).toMatchObject({ ok: true })
    expect((await userRow("bia")).bannerUrl).toBe(blobBanner("bia"))

    expect(await removeBanner()).toMatchObject({ ok: true })
    expect((await userRow("bia")).bannerUrl).toBeNull()

    holder.userId = "ana"
    expect(await removeAvatar()).toMatchObject({ ok: true })
    expect((await userRow("ana")).image).toBeNull()
    expect((await userRow("bia")).bannerUrl).toBeNull() // outra conta intacta
  })

  it("exigem estar logado", async () => {
    holder.userId = null
    await expect(updateAvatar({ imageUrl: blobAvatar("ana") })).rejects.toThrow("Não autenticado")
    await expect(removeBanner()).rejects.toThrow("Não autenticado")
  })
})

describe("updateBio", () => {
  it("guarda a bio sem espaços nas pontas; vazia vira nulo; passou de 160 é recusada", async () => {
    holder.userId = "ana"
    expect(await updateBio({ bio: "  Vendedora de contas.  " })).toMatchObject({ ok: true })
    expect((await userRow("ana")).bio).toBe("Vendedora de contas.")

    expect(await updateBio({ bio: "   " })).toMatchObject({ ok: true })
    expect((await userRow("ana")).bio).toBeNull()

    expect((await updateBio({ bio: "b".repeat(160) })).ok).toBe(true)
    expect(await updateBio({ bio: "b".repeat(161) })).toMatchObject({ ok: false, field: "bio" })
    expect((await userRow("ana")).bio).toBe("b".repeat(160))
  })
})

describe("updateAccentColor", () => {
  it("aceita as cores da lista e 'padrao' volta para nulo", async () => {
    holder.userId = "bia"
    expect(await updateAccentColor({ accentColor: "verde" })).toMatchObject({ ok: true })
    expect((await userRow("bia")).accentColor).toBe("verde")
    expect(await updateAccentColor({ accentColor: "padrao" })).toMatchObject({ ok: true })
    expect((await userRow("bia")).accentColor).toBeNull()
  })

  it("recusa qualquer outro valor — inclusive nomes herdados do JavaScript (constructor, __proto__, toString)", async () => {
    holder.userId = "bia"
    await updateAccentColor({ accentColor: "azul" })
    for (const bad of ["", "vermelho", "#ff0000", "constructor", "__proto__", "toString", "hasOwnProperty", "AZUL"]) {
      expect(await updateAccentColor({ accentColor: bad }), bad).toEqual({ ok: false, error: "Cor inválida." })
    }
    expect((await userRow("bia")).accentColor).toBe("azul")
  })
})

describe("isolamento entre contas", () => {
  it("nenhuma ação de 'Minha conta' mexe nos dados de outra pessoa", async () => {
    await t.query(
      `UPDATE "user" SET "bio" = 'Bio da Bia', "image" = $1, "bannerUrl" = $2, "accentColor" = 'ciano' WHERE "id" = 'bia'`,
      [blobAvatar("bia"), blobBanner("bia")],
    )
    const before = await userRow("bia")

    holder.userId = "ana"
    await updateDisplayName({ displayName: "Ana Nova" })
    await updateBio({ bio: "Bio nova da Ana" })
    await updateAccentColor({ accentColor: "verde" })
    await updateAvatar({ imageUrl: blobAvatar("ana", "png") })
    await updateBanner({ imageUrl: blobBanner("ana", "png") })
    await removeAvatar()
    await removeBanner()

    expect(await userRow("bia")).toEqual(before)
  })
})

/* ---------------------------------------------------------------------------
 * Exclusão da conta: o que bloqueia
 * ------------------------------------------------------------------------ */

describe("getDeletionBlockers", () => {
  it("conta limpa não tem bloqueio", async () => {
    expect(await getDeletionBlockers("bia")).toEqual([])
  })

  it("saldo disponível ou em custódia bloqueia", async () => {
    await addWallet("ana", 1, 0)
    await addWallet("bia", 0, 500)
    expect((await getDeletionBlockers("ana")).map((b) => b.code)).toEqual(["wallet"])
    expect((await getDeletionBlockers("bia")).map((b) => b.code)).toEqual(["wallet"])
  })

  it("carteira zerada não bloqueia", async () => {
    await addWallet("ana", 0, 0)
    expect(await getDeletionBlockers("ana")).toEqual([])
  })

  it("pedido em andamento bloqueia comprador E vendedor; pedido encerrado não", async () => {
    for (const status of ["aguardando_entrega", "entregue", "em_disputa"]) {
      await t.query(`TRUNCATE "order", "product_variant", "product" RESTART IDENTITY CASCADE`)
      await addOrder("ana", "bia", status)
      expect((await getDeletionBlockers("ana")).map((b) => b.code), `comprador/${status}`).toEqual(["orders"])
      expect((await getDeletionBlockers("bia")).map((b) => b.code), `vendedor/${status}`).toEqual(["orders"])
    }

    await t.query(`TRUNCATE "order", "product_variant", "product" RESTART IDENTITY CASCADE`)
    for (const status of ["concluido", "reembolsado", "cancelado"]) await addOrder("ana", "bia", status)
    expect(await getDeletionBlockers("ana")).toEqual([])
    expect(await getDeletionBlockers("bia")).toEqual([])
  })

  it("anúncio ativo bloqueia; pausado não", async () => {
    await addListing("ana", "pausado")
    expect(await getDeletionBlockers("ana")).toEqual([])
    await addListing("ana", "ativo")
    expect((await getDeletionBlockers("ana")).map((b) => b.code)).toEqual(["listings"])
  })

  it("vários bloqueios aparecem juntos", async () => {
    await addWallet("ana", 100, 0)
    await addListing("ana", "ativo")
    await addOrder("ana", "bia", "entregue")
    expect((await getDeletionBlockers("ana")).map((b) => b.code).sort()).toEqual(["listings", "orders", "wallet"])
  })

  it("moderação e administração não se autoexcluem (e só esse bloqueio é mostrado)", async () => {
    await addUser("mod", { role: "moderator" })
    await addUser("adm", { role: "admin" })
    await addWallet("mod", 999, 0)
    for (const id of ["mod", "adm"]) {
      expect((await getDeletionBlockers(id)).map((b) => b.code), id).toEqual(["staff"])
    }
  })
})

/* ---------------------------------------------------------------------------
 * Exclusão da conta: a ação
 * ------------------------------------------------------------------------ */

describe("exclusão de conta: o que sai do ar e dos arquivos", () => {
  const seedStore = async () => {
    await t.query(`INSERT INTO "seller_application" ("userId", "storeName", "storeSlug", "level", "status") VALUES ('ana', 'Loja da Ana', 'loja-da-ana', 4, 'aprovado')`)
    await t.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game", "status") VALUES ('ana', 'anuncio-pausado', 'Conta pausada', 'contas', 'Valorant', 'pausado')`)
  }

  it("a loja pública e o anúncio pausado deixam de abrir (os Termos prometem que o perfil deixa de ser público)", async () => {
    await seedStore()
    expect(await getSellerStorefront("loja-da-ana")).not.toBeNull()
    expect(await getProductBySlug("anuncio-pausado")).not.toBeNull()

    holder.userId = "ana"
    expect(await requestAccountDeletion({ confirm: "excluir minha conta" })).toMatchObject({ ok: true })

    expect(await getSellerStorefront("loja-da-ana")).toBeNull()
    expect(await getProductBySlug("anuncio-pausado")).toBeNull()
    // as linhas ficam (retenção legal); só deixam de ser públicas
    expect((await rows(`SELECT 1 FROM "seller_application" WHERE "userId" = 'ana'`)).length).toBe(1)
  })

  it("apaga do Blob o avatar e o banner do próprio usuário", async () => {
    holder.userId = "ana"
    await requestAccountDeletion({ confirm: "excluir minha conta" })
    expect(holder.blobDeleted).toEqual([[blobAvatar("ana"), blobBanner("ana")]])
  })

  it("não apaga URL que não é do próprio usuário nem arquivo de quem não tem imagem", async () => {
    await t.query(`UPDATE "user" SET "image" = $1, "bannerUrl" = NULL WHERE "id" = 'ana'`, [blobAvatar("outro")])
    holder.userId = "ana"
    await requestAccountDeletion({ confirm: "excluir minha conta" })
    expect(holder.blobDeleted).toEqual([])
  })

  it("se o Blob falhar, a conta é excluída do mesmo jeito", async () => {
    holder.blobFails = true
    holder.userId = "ana"
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await requestAccountDeletion({ confirm: "excluir minha conta" })).toMatchObject({ ok: true })
    consoleError.mockRestore()
    expect((await userRow("ana")).email).toContain("@ellowin.invalid")
  })
})

describe("requestAccountDeletion", () => {
  it("exige estar logado", async () => {
    holder.userId = null
    await expect(requestAccountDeletion({ confirm: "excluir minha conta" })).rejects.toThrow("Não autenticado")
  })

  it("só com a frase exata (sem diferenciar maiúsculas nem espaços nas pontas)", async () => {
    holder.userId = "bia"
    for (const wrong of ["", "excluir", "excluir conta", "sim", "excluir minha  conta"]) {
      expect(await requestAccountDeletion({ confirm: wrong }), wrong).toMatchObject({ ok: false, field: "confirm" })
    }
    expect((await userRow("bia")).deletedAt).toBeNull()

    expect(await requestAccountDeletion({ confirm: "  EXCLUIR Minha CONTA  " })).toMatchObject({ ok: true })
    expect((await userRow("bia")).deletedAt).not.toBeNull()
  })

  it("com bloqueio, recusa com a mensagem do bloqueio e NÃO muda nada", async () => {
    await addWallet("ana", 5_000, 0)
    holder.userId = "ana"

    const result = await requestAccountDeletion({ confirm: "excluir minha conta" })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("saldo na carteira")
    const u = await userRow("ana")
    expect(u).toMatchObject({ name: "Nome Legal ana", email: "ana@teste.dev", displayName: "Ana_Gamer", deletedAt: null })
    expect(holder.deletedEmails).toEqual([])
  })

  it("limita a 3 tentativas por hora (as com a frase certa, mesmo recusadas por bloqueio)", async () => {
    await addWallet("bia", 100, 0) // bloqueia, então cada tentativa é recusada mas conta
    holder.userId = "bia"
    for (let i = 0; i < 3; i++) {
      const r = await requestAccountDeletion({ confirm: "excluir minha conta" })
      expect(r.error, `tentativa ${i + 1}`).toContain("saldo na carteira")
    }

    // Mesmo depois de resolver o bloqueio, a 4ª tentativa na hora é barrada.
    await t.query(`UPDATE "wallet" SET "availableCents" = 0 WHERE "userId" = 'bia'`)
    const blocked = await requestAccountDeletion({ confirm: "excluir minha conta" })
    expect(blocked).toMatchObject({ ok: false })
    expect(blocked.error).toContain("Muitas tentativas")
    expect((await userRow("bia")).deletedAt).toBeNull()
  })

  it("a ordem das checagens: a frase errada nem gasta o limite", async () => {
    holder.userId = "bia"
    for (let i = 0; i < 6; i++) expect((await requestAccountDeletion({ confirm: "frase errada" })).field).toBe("confirm")
    expect((await requestAccountDeletion({ confirm: "excluir minha conta" })).ok).toBe(true)
  })
})

describe("requestAccountDeletion: o que é anonimizado e o que é mantido", () => {
  async function seedFullAccount() {
    await t.query(`INSERT INTO "session" ("id", "expiresAt", "token", "userId") VALUES ('s1', now() + interval '1 day', 'tok1', 'ana'), ('s2', now() + interval '1 day', 'tok2', 'ana')`)
    await t.query(`INSERT INTO "account" ("id", "accountId", "providerId", "userId", "password") VALUES ('a1', 'ana', 'credential', 'ana', 'hash'), ('a2', 'g-123', 'google', 'ana', NULL)`)
    await t.query(`INSERT INTO "session" ("id", "expiresAt", "token", "userId") VALUES ('sb', now() + interval '1 day', 'tokb', 'bia')`)
  }

  it("apaga os dados públicos e de contato, mantém CPF e nome legal pelo prazo de retenção", async () => {
    await seedFullAccount()
    holder.userId = "ana"

    expect(await requestAccountDeletion({ confirm: "excluir minha conta" })).toEqual({ ok: true, message: "Conta excluída. Você será desconectado." })

    const u = await userRow("ana")
    expect(u).toMatchObject({
      name: "Usuário excluído",
      email: "excluido+ana@ellowin.invalid",
      emailVerified: false,
      displayName: null,
      bio: null,
      image: null,
      bannerUrl: null,
      accentColor: null,
    })
    expect(u.deletedAt).not.toBeNull()

    // O que a lei manda guardar continua; o telefone não.
    expect(await profileRow("ana")).toMatchObject({ fullName: "Nome Legal ana", cpf: "52998224725", phone: null, phoneVerified: false })
  })

  it("derruba todas as sessões e credenciais (login fica impossível), só da conta excluída", async () => {
    await seedFullAccount()
    holder.userId = "ana"
    await requestAccountDeletion({ confirm: "excluir minha conta" })

    expect(await rows(`SELECT 1 FROM "session" WHERE "userId" = 'ana'`)).toHaveLength(0)
    expect(await rows(`SELECT 1 FROM "account" WHERE "userId" = 'ana'`)).toHaveLength(0)
    expect(await rows(`SELECT 1 FROM "session" WHERE "userId" = 'bia'`)).toHaveLength(1)
  })

  it("não mexe nos dados de outra conta", async () => {
    holder.userId = "ana"
    await requestAccountDeletion({ confirm: "excluir minha conta" })
    expect(await userRow("bia")).toMatchObject({ name: "Nome Legal bia", email: "bia@teste.dev", displayName: "Bia", deletedAt: null })
    expect((await profileRow("bia")).phone).toBe("11999991111")
  })

  it("pedidos e avaliações encerrados continuam apontando para a conta anonimizada", async () => {
    const { orderId, productId } = await addOrder("ana", "bia", "concluido")
    await t.query(`INSERT INTO "review" ("orderId", "productId", "sellerId", "buyerId", "rating", "comment") VALUES ($1, $2, 'bia', 'ana', 5, 'Ótimo')`, [orderId, productId])
    holder.userId = "ana"

    expect((await requestAccountDeletion({ confirm: "excluir minha conta" })).ok).toBe(true)

    const o = (await rows(`SELECT "buyerId" FROM "order" WHERE "id" = $1`, [orderId]))[0]
    expect(o.buyerId).toBe("ana")
    expect(await rows(`SELECT 1 FROM "review" WHERE "buyerId" = 'ana'`)).toHaveLength(1)
  })

  it("avisa por e-mail no endereço ORIGINAL e a falha do envio não desfaz a exclusão", async () => {
    holder.userId = "ana"
    holder.deletedEmailFails = true

    const result = await requestAccountDeletion({ confirm: "excluir minha conta" })

    expect(result.ok).toBe(true)
    expect(holder.deletedEmails).toEqual(["ana@teste.dev"])
    expect((await userRow("ana")).deletedAt).not.toBeNull()
  })

  it("dois usuários excluídos não colidem no e-mail (placeholder único) e o e-mail antigo fica livre", async () => {
    holder.userId = "ana"
    await requestAccountDeletion({ confirm: "excluir minha conta" })
    holder.userId = "bia"
    await requestAccountDeletion({ confirm: "excluir minha conta" })

    expect((await userRow("ana")).email).toBe("excluido+ana@ellowin.invalid")
    expect((await userRow("bia")).email).toBe("excluido+bia@ellowin.invalid")

    // O endereço original pode ser usado de novo por um cadastro novo.
    await addUser("nova-ana")
    await t.query(`UPDATE "user" SET "email" = 'ana@teste.dev' WHERE "id" = 'nova-ana'`)
    expect((await userRow("nova-ana")).email).toBe("ana@teste.dev")
  })

  it("o apelido liberado pode ser reaproveitado por outra pessoa", async () => {
    holder.userId = "ana"
    await requestAccountDeletion({ confirm: "excluir minha conta" })

    holder.userId = "bia"
    expect(await updateDisplayName({ displayName: "Ana_Gamer" })).toMatchObject({ ok: true })
  })

  it("excluir de novo uma conta já excluída não quebra nem muda os dados mantidos", async () => {
    holder.userId = "ana"
    await requestAccountDeletion({ confirm: "excluir minha conta" })
    const again = await requestAccountDeletion({ confirm: "excluir minha conta" })

    expect(again.ok).toBe(true)
    expect((await profileRow("ana")).cpf).toBe("52998224725")
    expect((await userRow("ana")).email).toBe("excluido+ana@ellowin.invalid")
  })
})

/* ---------------------------------------------------------------------------
 * Juntar conta com o Google (neutralizeUnverifiedCredentials)
 * ------------------------------------------------------------------------ */

describe("neutralizeUnverifiedCredentials", () => {
  async function seed(userId: string) {
    await t.query(`INSERT INTO "account" ("id", "accountId", "providerId", "userId", "password") VALUES ($1 || '-cred', $1, 'credential', $1, 'hash-do-invasor')`, [userId])
    await t.query(`INSERT INTO "account" ("id", "accountId", "providerId", "userId") VALUES ($1 || '-g', 'g-' || $1, 'google', $1)`, [userId])
    await t.query(`INSERT INTO "session" ("id", "expiresAt", "token", "userId") VALUES ($1 || '-s1', now() + interval '1 day', $1 || '-t1', $1), ($1 || '-s2', now() + interval '1 day', $1 || '-t2', $1)`, [userId])
  }

  it("conta com e-mail NÃO confirmado: some a senha (credential) e todas as sessões", async () => {
    await addUser("novo", { emailVerified: false })
    await seed("novo")

    const removed = await neutralizeUnverifiedCredentials("novo")

    expect(removed).toBe(3) // 1 senha + 2 sessões
    expect(await rows(`SELECT 1 FROM "account" WHERE "userId" = 'novo' AND "providerId" = 'credential'`)).toHaveLength(0)
    expect(await rows(`SELECT 1 FROM "session" WHERE "userId" = 'novo'`)).toHaveLength(0)
    // O vínculo social não é tocado.
    expect(await rows(`SELECT 1 FROM "account" WHERE "userId" = 'novo' AND "providerId" = 'google'`)).toHaveLength(1)
  })

  it("conta com e-mail confirmado mantém senha e sessões", async () => {
    await addUser("velho", { emailVerified: true })
    await seed("velho")

    expect(await neutralizeUnverifiedCredentials("velho")).toBe(0)
    expect(await rows(`SELECT 1 FROM "account" WHERE "userId" = 'velho'`)).toHaveLength(2)
    expect(await rows(`SELECT 1 FROM "session" WHERE "userId" = 'velho'`)).toHaveLength(2)
  })

  it("usuário inexistente e conta não confirmada já limpa devolvem 0, sem mexer em outras contas", async () => {
    await addUser("novo", { emailVerified: false })
    await seed("bia")
    expect(await neutralizeUnverifiedCredentials("fantasma")).toBe(0)
    expect(await neutralizeUnverifiedCredentials("novo")).toBe(0)
    expect(await rows(`SELECT 1 FROM "account" WHERE "userId" = 'bia'`)).toHaveLength(2)
  })
})
