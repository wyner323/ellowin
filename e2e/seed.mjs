import { hashPassword } from "better-auth/crypto"
import pg from "pg"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { BUYER, E2E_DB, LISTING, MOD, PASSWORD, RECARGA, SELLER, adminUrl, e2eDatabaseUrl } from "./env.mjs"

/** Cria o banco `ellowin_e2e` do zero, aplica as migrações reais de drizzle/ e grava a semente. */
export async function createAndSeed() {
  const admin = new pg.Client({ connectionString: adminUrl() })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${E2E_DB} WITH (FORCE)`)
    await admin.query(`CREATE DATABASE ${E2E_DB}`)
  } finally {
    await admin.end()
  }

  const db = new pg.Client({ connectionString: e2eDatabaseUrl(), options: "-c timezone=UTC" })
  await db.connect()
  try {
    const dir = path.resolve(process.cwd(), "drizzle")
    const files = readdirSync(dir)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort()
    for (const file of files) {
      for (const statement of readFileSync(path.join(dir, file), "utf8").split("--> statement-breakpoint")) {
        if (statement.trim()) await db.query(statement)
      }
    }

    const hash = await hashPassword(PASSWORD)
    const people = [
      { ...SELLER, name: "Vendedor E2E", cpf: "52998224725", phone: "11999999999" },
      { ...BUYER, name: "Comprador E2E", cpf: "11144477735", phone: "11988888888" },
      { ...MOD, name: "Moderador E2E", cpf: "39053344705", phone: "11977777777", role: "moderator" },
    ]
    for (const p of people) {
      await db.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified", "displayName", "role") VALUES ($1, $2, $3, true, $4, $5)`, [
        p.id,
        p.name,
        p.email,
        p.displayName,
        p.role ?? "user",
      ])
      await db.query(`INSERT INTO "account" ("id", "accountId", "providerId", "userId", "password") VALUES ($1, $2, 'credential', $2, $3)`, [
        `acc-${p.id}`,
        p.id,
        hash,
      ])
      await db.query(
        `INSERT INTO "profile" ("userId", "fullName", "cpf", "phone", "birthDate", "phoneVerified") VALUES ($1, $2, $3, $4, '1990-01-01', true)`,
        [p.id, p.name, p.cpf, p.phone],
      )
    }

    await db.query(
      `INSERT INTO "seller_application" ("userId", "storeName", "storeSlug", "category", "description", "documentType", "documentNumber", "pixKeyType", "pixKey", "acceptedTerms", "currentStep", "status")
       VALUES ($1, 'Loja E2E', $2, 'contas', 'Loja de teste automático.', 'cpf', '52998224725', 'cpf', '52998224725', true, 5, 'aprovado')`,
      [SELLER.id, SELLER.storeSlug],
    )

    const product = await db.query(
      `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game", "description", "deliveryType", "deliveryTime", "accountOrigin", "status")
       VALUES ($1, $2, $3, 'contas', 'valorant', 'Conta de teste para o fluxo de compra.', 'manual', 'Até 24 horas', 'criador_sem_recuperacao', 'ativo') RETURNING "id"`,
      [SELLER.id, LISTING.slug, LISTING.title],
    )
    await db.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, 'Conta Ouro', $2, 5)`, [
      product.rows[0].id,
      LISTING.priceCents,
    ])

    // O vendedor já está aprovado em recargas (categoria restrita) e tem uma recarga à venda, para a compra que pede o ID do jogador.
    await db.query(
      `INSERT INTO "seller_category_approval" ("userId", "categorySlug", "status", "statement", "decidedBy", "decidedAt", "stockReview")
       VALUES ($1, 'recargas', 'aprovado', 'Recargas pelo canal oficial do jogo.', $2, now(), false)`,
      [SELLER.id, MOD.id],
    )
    const recarga = await db.query(
      `INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug", "game", "description", "deliveryType", "deliveryTime", "status")
       VALUES ($1, $2, $3, 'recargas', 'free-fire', 'Recarga de diamantes feita direto no perfil do jogador.', 'manual', 'Até 24 horas', 'ativo') RETURNING "id"`,
      [SELLER.id, RECARGA.slug, RECARGA.title],
    )
    await db.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES ($1, '100 diamantes', $2, 5)`, [
      recarga.rows[0].id,
      RECARGA.priceCents,
    ])

    // Saldo do comprador com o lançamento de depósito correspondente (a conferência de dinheiro tem de fechar).
    await db.query(`INSERT INTO "wallet" ("userId", "availableCents") VALUES ($1, $2)`, [BUYER.id, LISTING.buyerFundsCents])
    await db.query(
      `INSERT INTO "wallet_transaction" ("userId", "kind", "amountCents", "balanceAfterCents", "description") VALUES ($1, 'deposito', $2, $2, 'Depósito de teste')`,
      [BUYER.id, LISTING.buyerFundsCents],
    )
  } finally {
    await db.end()
  }
}
