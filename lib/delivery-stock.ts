import type { PoolClient } from "@neondatabase/serverless"
import { pool } from "@/lib/db"
import { stockNeedsReview } from "@/lib/category-approval"
import { MAX_STOCK_AVAILABLE, allowsAutoDelivery, maskStockItem } from "@/lib/delivery-stock-lines"
import { decryptField, encryptField, hasEncryptionKey, hashField } from "@/lib/secret-box"
import { withTransaction } from "@/lib/wallet"

/**
 * Estoque de entrega automática (docs/entrega-automatica.md). Tudo que muda o estoque trava antes a linha da variante
 * (`FOR UPDATE`), a mesma que `purchase` trava, e termina com `syncStock`: `product_variant.stock` de um anúncio
 * automático é sempre o número de itens disponíveis, então vitrine, filtros e alerta de estoque baixo seguem iguais.
 */

/** Recusa esperada: a mensagem é escrita para o vendedor e pode aparecer na tela. */
export class StockError extends Error {}

const stockContext = (variantId: number) => `stock:${variantId}`

/** Sem a migração 0011 aplicada a tabela não existe: quem lê trata como "indisponível" em vez de quebrar a tela. */
export function isMissingStockTable(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "42P01"
}

/** A tabela do estoque existe? (`false` enquanto a migração 0011 não foi aplicada.) */
export async function stockTableExists() {
  const { rows } = await pool.query<{ ok: boolean }>(`SELECT to_regclass('public.delivery_stock_item') IS NOT NULL AS ok`)
  return rows[0]?.ok === true
}

/** Igual a `stockTableExists`, mas dentro de uma transação já aberta (a compra). */
export async function stockTableExistsIn(client: PoolClient) {
  const { rows } = await client.query<{ ok: boolean }>(`SELECT to_regclass('public.delivery_stock_item') IS NOT NULL AS ok`)
  return rows[0]?.ok === true
}

/** A tabela de lotes existe? (`false` até a migração 0015: antes dela todo item vale como aprovado.) */
export async function batchTableExistsIn(client: Pick<PoolClient, "query">) {
  const { rows } = await client.query<{ ok: boolean }>(`SELECT to_regclass('public.stock_batch') IS NOT NULL AS ok`)
  return rows[0]?.ok === true
}

/** Item à venda: não vendido e sem lote ou de um lote aprovado (lote pendente, em quarentena ou recusado NÃO vende). */
function sellableSql(hasBatches: boolean, alias = "delivery_stock_item") {
  const base = `"${alias}"."orderId" IS NULL`
  if (!hasBatches) return base
  return `${base} AND ("${alias}"."batchId" IS NULL OR EXISTS (SELECT 1 FROM "stock_batch" b WHERE b."id" = "${alias}"."batchId" AND b."status" = 'aprovado'))`
}

/**
 * A entrega automática pode ser LIGADA num anúncio? Só com a chave de cifra configurada e a migração aplicada: sem
 * uma delas o estoque não pode existir com segurança, então a opção fica desligada em vez de prometer o que não entrega.
 */
export async function autoDeliveryAvailable() {
  return hasEncryptionKey() && (await stockTableExists())
}

/** Itens ainda disponíveis em qualquer item de um anúncio (zero se a tabela ainda não existe). */
export async function availableStockInProduct(productId: number) {
  try {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "delivery_stock_item" i JOIN "product_variant" v ON v."id" = i."variantId"
        WHERE v."productId" = $1 AND i."orderId" IS NULL`,
      [productId],
    )
    return rows[0]?.n ?? 0
  } catch (error) {
    if (isMissingStockTable(error)) return 0
    throw error
  }
}

/** Iguala o estoque da variante ao número de itens disponíveis. A variante já deve estar travada por quem chama. */
export async function syncStock(client: PoolClient, variantId: number) {
  const batches = await batchTableExistsIn(client)
  await client.query(
    `UPDATE "product_variant"
        SET "stock" = (SELECT count(*) FROM "delivery_stock_item" WHERE "variantId" = $1 AND ${sellableSql(batches)})
      WHERE "id" = $1`,
    [variantId],
  )
}

/**
 * Reserva o item disponível mais antigo para o pedido e devolve o conteúdo (já decifrado). O conteúdo SAI desta tabela
 * (`payload` vira nulo): quem chama o grava, cifrado para o pedido, em `order.deliveryPayload`. Devolve nulo se não há item.
 */
export async function claimStockItem(client: PoolClient, variantId: number, orderId: number): Promise<string | null> {
  const batches = await batchTableExistsIn(client)
  const { rows } = await client.query<{ id: number; payload: string }>(
    `SELECT "id", "payload" FROM "delivery_stock_item"
      WHERE "variantId" = $1 AND ${sellableSql(batches)}
      ORDER BY "id" LIMIT 1
      FOR UPDATE SKIP LOCKED`,
    [variantId],
  )
  const item = rows[0]
  if (!item) return null

  const plain = decryptField(item.payload, stockContext(variantId))
  await client.query(
    `UPDATE "delivery_stock_item" SET "orderId" = $2, "soldAt" = now(), "payload" = NULL WHERE "id" = $1`,
    [item.id, orderId],
  )
  return plain
}

/**
 * Cadastra itens no estoque de um item do anúncio. Só o dono, só em anúncio de entrega automática e de categoria que
 * aceita isso, e só com a chave de cifra configurada. Repetidos (inclusive de itens já vendidos) são ignorados.
 */
export async function addStockItems(sellerId: string, variantId: number, items: string[], statement?: string) {
  if (!hasEncryptionKey()) {
    throw new StockError("O estoque automático ainda não está disponível: o armazenamento seguro dos itens não foi configurado.")
  }
  if (items.length === 0) throw new StockError("Informe ao menos um item.")

  return withTransaction(async (client) => {
    const { rows } = await client.query<{ sellerId: string; deliveryType: string; categorySlug: string }>(
      `SELECT p."sellerId", p."deliveryType", p."categorySlug"
         FROM "product_variant" v JOIN "product" p ON p."id" = v."productId"
        WHERE v."id" = $1
        FOR UPDATE OF v`,
      [variantId],
    )
    const variant = rows[0]
    if (!variant || variant.sellerId !== sellerId) throw new StockError("Item do anúncio não encontrado.")
    if (variant.deliveryType !== "automatica") throw new StockError("Este anúncio não é de entrega automática.")
    if (!allowsAutoDelivery(variant.categorySlug)) throw new StockError("Esta categoria não aceita entrega automática.")

    const [{ n }] = (
      await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM "delivery_stock_item" WHERE "variantId" = $1 AND "orderId" IS NULL`,
        [variantId],
      )
    ).rows
    if (n + items.length > MAX_STOCK_AVAILABLE) {
      throw new StockError(`Cada item do anúncio comporta até ${MAX_STOCK_AVAILABLE.toLocaleString("pt-BR")} itens disponíveis (hoje há ${n}).`)
    }

    // Categorias que exigem análise: o envio vira um lote PENDENTE e só entra à venda quando a moderação aprova.
    // Sem a tabela de lotes (migração 0015 pendente) tudo entra como antes, sem lote.
    let batchId: number | null = null
    let review = false
    if (await batchTableExistsIn(client)) {
      review = await stockNeedsReview(sellerId, variant.categorySlug, client)
      const batch = await client.query<{ id: number }>(
        `INSERT INTO "stock_batch" ("variantId", "sellerId", "itemCount", "status", "statement")
         VALUES ($1, $2, $3, $4, $5) RETURNING "id"`,
        [variantId, sellerId, items.length, review ? "pendente" : "aprovado", (statement ?? "").trim().slice(0, 300) || null],
      )
      batchId = batch.rows[0].id
    }

    const context = stockContext(variantId)
    // Sem a tabela de lotes a coluna batchId também não existe (mesma migração): o insert antigo, sem ela.
    const values = [
      variantId,
      sellerId,
      items.map((item) => encryptField(item, context)),
      items.map((item) => hashField(item, context)),
      items.map(maskStockItem),
    ]
    const inserted =
      batchId === null
        ? await client.query(
            `INSERT INTO "delivery_stock_item" ("variantId", "sellerId", "payload", "payloadHash", "mask")
             SELECT $1, $2, t.payload, t.hash, t.mask FROM unnest($3::text[], $4::text[], $5::text[]) AS t(payload, hash, mask)
             ON CONFLICT ("variantId", "payloadHash") DO NOTHING`,
            values,
          )
        : await client.query(
            `INSERT INTO "delivery_stock_item" ("variantId", "sellerId", "payload", "payloadHash", "mask", "batchId")
             SELECT $1, $2, t.payload, t.hash, t.mask, $6::integer FROM unnest($3::text[], $4::text[], $5::text[]) AS t(payload, hash, mask)
             ON CONFLICT ("variantId", "payloadHash") DO NOTHING`,
            [...values, batchId],
          )

    const added = inserted.rowCount ?? 0
    if (batchId !== null) {
      // O lote guarda só o que realmente entrou (repetidos foram ignorados); lote vazio some.
      if (added === 0) await client.query(`DELETE FROM "stock_batch" WHERE "id" = $1`, [batchId])
      else await client.query(`UPDATE "stock_batch" SET "itemCount" = $2 WHERE "id" = $1`, [batchId, added])
    }

    await syncStock(client, variantId)
    return { added, ignored: items.length - added, pendingReview: review && added > 0 }
  })
}

/** Apaga um item que ainda não foi vendido. Item vendido nunca sai (é a prova do que foi entregue). */
export async function removeStockItem(sellerId: string, itemId: number) {
  return withTransaction(async (client) => {
    const found = await client.query<{ variantId: number }>(
      `SELECT "variantId" FROM "delivery_stock_item" WHERE "id" = $1 AND "sellerId" = $2 AND "orderId" IS NULL`,
      [itemId, sellerId],
    )
    const variantId = found.rows[0]?.variantId
    if (variantId === undefined) throw new StockError("Item não encontrado ou já vendido.")

    // Mesma ordem de trava de purchase/addStockItems: variante primeiro, depois o item.
    await client.query(`SELECT 1 FROM "product_variant" WHERE "id" = $1 FOR UPDATE`, [variantId])
    const deleted = await client.query(
      `DELETE FROM "delivery_stock_item" WHERE "id" = $1 AND "sellerId" = $2 AND "orderId" IS NULL`,
      [itemId, sellerId],
    )
    if ((deleted.rowCount ?? 0) === 0) throw new StockError("Item não encontrado ou já vendido.")
    await syncStock(client, variantId)
  })
}

export type StockBatchSummary = { id: number; itemCount: number; status: string; createdAt: Date; reviewNote: string | null }

export type StockVariantSummary = {
  variantId: number
  label: string
  /** itens à venda agora */
  available: number
  /** itens cadastrados que ainda esperam a moderação (ou estão em quarentena) e por isso não vendem */
  held: number
  sold: number
  /** últimos envios e a situação de cada um (vazio antes da migração 0015) */
  batches: StockBatchSummary[]
  /** só a máscara de cada item disponível, nunca o conteúdo */
  items: { id: number; mask: string }[]
}

const MASKED_ITEMS_SHOWN = 200

/**
 * O estoque de um anúncio para o painel: por item do anúncio, quantos disponíveis e vendidos e a máscara dos disponíveis.
 * Devolve nulo se o anúncio não é do vendedor ou se a migração 0011 ainda não foi aplicada.
 */
export async function getProductStock(sellerId: string, productId: number): Promise<StockVariantSummary[] | null> {
  try {
    const batches = await batchTableExistsIn(pool)
    const { rows } = await pool.query<{ id: number; label: string; available: number; unsold: number; sold: number }>(
      `SELECT v."id", v."label",
              (SELECT count(*)::int FROM "delivery_stock_item" i WHERE i."variantId" = v."id" AND ${sellableSql(batches, "i")}) AS available,
              (SELECT count(*)::int FROM "delivery_stock_item" i WHERE i."variantId" = v."id" AND i."orderId" IS NULL) AS unsold,
              (SELECT count(*)::int FROM "delivery_stock_item" i WHERE i."variantId" = v."id" AND i."orderId" IS NOT NULL) AS sold
         FROM "product_variant" v JOIN "product" p ON p."id" = v."productId"
        WHERE p."id" = $1 AND p."sellerId" = $2 AND v."active"
        ORDER BY v."sortOrder", v."id"`,
      [productId, sellerId],
    )

    const summaries: StockVariantSummary[] = []
    for (const row of rows) {
      const masks = await pool.query<{ id: number; mask: string }>(
        `SELECT "id", "mask" FROM "delivery_stock_item" WHERE "variantId" = $1 AND "orderId" IS NULL ORDER BY "id" LIMIT ${MASKED_ITEMS_SHOWN}`,
        [row.id],
      )
      const recent = batches
        ? await pool.query<StockBatchSummary>(
            `SELECT "id", "itemCount", "status", "createdAt", "reviewNote" FROM "stock_batch" WHERE "variantId" = $1 ORDER BY "id" DESC LIMIT 5`,
            [row.id],
          )
        : { rows: [] as StockBatchSummary[] }
      summaries.push({
        variantId: row.id,
        label: row.label,
        available: row.available,
        held: row.unsold - row.available,
        sold: row.sold,
        batches: recent.rows,
        items: masks.rows,
      })
    }
    return summaries
  } catch (error) {
    if (isMissingStockTable(error)) return null
    throw error
  }
}

/** LGPD: ao anonimizar uma conta, os itens ainda não vendidos (segredos do vendedor) são apagados. Os vendidos ficam (já sem conteúdo). */
export async function purgeAvailableStock(client: PoolClient, sellerId: string) {
  // Checa a tabela antes: um erro dentro de uma transação a deixa abortada, e o COMMIT de quem chama viraria ROLLBACK.
  const { rows } = await client.query<{ ok: boolean }>(`SELECT to_regclass('public.delivery_stock_item') IS NOT NULL AS ok`)
  if (rows[0]?.ok !== true) return
  await client.query(`DELETE FROM "delivery_stock_item" WHERE "sellerId" = $1 AND "orderId" IS NULL`, [sellerId])
}
