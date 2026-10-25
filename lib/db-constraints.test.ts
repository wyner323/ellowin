import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "@/lib/test-db"

/**
 * As CHECK de valor da migração 0014: o código já respeita essas regras, e aqui se prova que o BANCO também
 * recusa a linha errada (última defesa contra um bug futuro ou um UPDATE manual). Mutação: apague uma
 * constraint do SQL e o caso correspondente passa a gravar o valor inválido.
 */

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
  await db.query(`INSERT INTO "user" ("id", "name", "email", "emailVerified") VALUES ('u1', 'U', 'u1@teste.dev', true), ('u2', 'V', 'u2@teste.dev', true)`)
  await db.query(`INSERT INTO "product" ("sellerId", "slug", "title", "categorySlug") VALUES ('u1', 'p', 'Produto', 'contas')`)
  await db.query(`INSERT INTO "product_variant" ("productId", "label", "priceCents", "stock") VALUES (1, 'v', 1000, 3)`)
  await db.query(
    `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents", "feeCents", "sellerNetCents")
     VALUES ('u2', 'u1', 1, 1, 'Produto', 'v', 1000, 100, 900)`,
  )
})

afterAll(async () => {
  await db.close()
})

const rejected = (sql: string, params: unknown[] = []) => expect(db.query(sql, params)).rejects.toThrow(/violates check constraint/)

describe("CHECK de valor (migração 0014)", () => {
  it("variante: preço precisa ser positivo e o estoque não pode ficar negativo", async () => {
    await rejected(`INSERT INTO "product_variant" ("productId", "label", "priceCents") VALUES (1, 'x', 0)`)
    await rejected(`INSERT INTO "product_variant" ("productId", "label", "priceCents") VALUES (1, 'x', -5)`)
    await rejected(`UPDATE "product_variant" SET "stock" = "stock" - 4 WHERE "id" = 1`)
    await db.query(`UPDATE "product_variant" SET "stock" = "stock" - 3 WHERE "id" = 1`)
    expect((await db.query(`SELECT "stock" FROM "product_variant" WHERE "id" = 1`)).rows[0].stock).toBe(0)
  })

  it("pedido: valor positivo, taxa e líquido do vendedor nunca negativos", async () => {
    await rejected(
      `INSERT INTO "order" ("buyerId", "sellerId", "productId", "variantId", "productTitle", "variantLabel", "amountCents") VALUES ('u2', 'u1', 1, 1, 'P', 'v', 0)`,
    )
    await rejected(`UPDATE "order" SET "feeCents" = -1 WHERE "id" = 1`)
    await rejected(`UPDATE "order" SET "sellerNetCents" = -1 WHERE "id" = 1`)
    // o que já é válido continua passando (mudança de status, por exemplo)
    await db.query(`UPDATE "order" SET "status" = 'entregue' WHERE "id" = 1`)
  })

  it("avaliação: nota de 1 a 5", async () => {
    for (const rating of [0, 6, -1]) {
      await rejected(`INSERT INTO "review" ("orderId", "productId", "sellerId", "buyerId", "rating") VALUES (1, 1, 'u1', 'u2', $1)`, [rating])
    }
    await db.query(`INSERT INTO "review" ("orderId", "productId", "sellerId", "buyerId", "rating") VALUES (1, 1, 'u1', 'u2', 5)`)
  })

  it("extrato: o saldo gravado depois do movimento não pode ser negativo", async () => {
    await rejected(`INSERT INTO "wallet_transaction" ("userId", "kind", "amountCents", "balanceAfterCents") VALUES ('u1', 'saque', -500, -1)`)
    await db.query(`INSERT INTO "wallet_transaction" ("userId", "kind", "amountCents", "balanceAfterCents") VALUES ('u1', 'deposito', 500, 500)`)
  })
})
