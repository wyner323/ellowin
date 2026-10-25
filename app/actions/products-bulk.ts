"use server"

import { revalidatePath } from "next/cache"
import { pool } from "@/lib/db"
import { MAX_BULK_CHANGES, parseChange, type BulkChange } from "@/lib/bulk-edit"
import { pingIndexNow } from "@/lib/indexnow"
import { notifyPriceChange } from "@/lib/notify"
import { hitRateLimit } from "@/lib/rate-limit"
import { accountBlock, getUserId } from "@/lib/session"
import { withTransaction } from "@/lib/wallet"
import type { ActionResult } from "@/app/actions/auth"

/**
 * Edição de preço e estoque de vários itens de uma vez. O id do item só escolhe a linha: cada um tem de ser de um
 * anúncio do vendedor da sessão, e tudo é validado ANTES de gravar (uma mudança ruim recusa o lote inteiro, nada fica
 * pela metade). Estoque de anúncio de entrega automática não se edita aqui: é o número de itens cadastrados.
 */
export async function bulkUpdateVariants(changes: BulkChange[]): Promise<ActionResult & { updated?: number }> {
  const userId = await getUserId()

  if (!Array.isArray(changes) || changes.length === 0) return { ok: false, error: "Nenhuma alteração para salvar." }
  if (changes.length > MAX_BULK_CHANGES) return { ok: false, error: `Salve até ${MAX_BULK_CHANGES} itens por vez.` }

  const ids = changes.map((c) => c?.variantId)
  if (ids.some((id) => !Number.isInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
    return { ok: false, error: "Pedido inválido." }
  }

  const blocked = await accountBlock(userId, "editar anúncios")
  if (blocked) return blocked

  if (!(await hitRateLimit(`bulk-edit:${userId}`, 30, 60 * 60))) {
    return { ok: false, error: "Muitas edições em lote em pouco tempo. Tente de novo mais tarde." }
  }

  // Só os itens ATIVOS de anúncios do próprio vendedor entram.
  const { rows } = await pool.query<{ id: number; label: string; deliveryType: string; slug: string; productId: number; priceCents: number }>(
    `SELECT v."id", v."label", v."priceCents", p."id" AS "productId", p."deliveryType", p."slug"
       FROM "product_variant" v JOIN "product" p ON p."id" = v."productId"
      WHERE v."id" = ANY($1::int[]) AND p."sellerId" = $2 AND v."active"`,
    [ids, userId],
  )
  if (rows.length !== ids.length) return { ok: false, error: "Algum item não foi encontrado. Atualize a página e tente de novo." }
  const byId = new Map(rows.map((r) => [r.id, r]))

  const parsed: { variantId: number; priceCents?: number; stock?: number }[] = []
  for (const change of changes) {
    const item = byId.get(change.variantId)!
    const result = parseChange({ variantId: change.variantId, price: change.price, stock: change.stock })
    if (result.error) return { ok: false, error: `${item.label}: ${result.error}` }
    if (result.stock !== undefined && item.deliveryType === "automatica") {
      return { ok: false, error: `${item.label}: o estoque da entrega automática é o número de itens cadastrados (aba Estoque do anúncio).` }
    }
    parsed.push({ variantId: change.variantId, priceCents: result.priceCents, stock: result.stock })
  }

  await withTransaction(async (client) => {
    for (const p of parsed) {
      // COALESCE: o campo que não veio fica como está. O UPDATE trava a linha, a mesma que `purchase` trava.
      await client.query(
        `UPDATE "product_variant" SET "priceCents" = COALESCE($2::int, "priceCents"), "stock" = COALESCE($3::int, "stock") WHERE "id" = $1`,
        [p.variantId, p.priceCents ?? null, p.stock ?? null],
      )
    }
    await client.query(
      `UPDATE "product" SET "updatedAt" = now() WHERE "id" IN (SELECT "productId" FROM "product_variant" WHERE "id" = ANY($1::int[]))`,
      [ids],
    )
  })

  const slugs = [...new Set(rows.map((r) => r.slug))]
  revalidatePath("/painel/vendedor/produtos")
  revalidatePath("/painel/vendedor/produtos/lote")
  revalidatePath("/")
  for (const slug of slugs) revalidatePath(`/produtos/${slug}`)
  // O título do resultado na busca traz o preço: avisa os buscadores dos anúncios que mudaram de preço.
  if (parsed.some((p) => p.priceCents !== undefined)) pingIndexNow(slugs.slice(0, 100).map((s) => `/produtos/${s}`))

  // Quem favoritou o anúncio recebe o aviso de queda de preço quando o menor preço à venda baixou (só preço realmente mudado).
  const repriced = new Set(parsed.filter((p) => p.priceCents !== undefined && p.priceCents !== byId.get(p.variantId)!.priceCents).map((p) => byId.get(p.variantId)!.productId))
  for (const productId of repriced) notifyPriceChange(productId)

  return { ok: true, updated: parsed.length, message: `${parsed.length} ${parsed.length === 1 ? "item atualizado" : "itens atualizados"}.` }
}
