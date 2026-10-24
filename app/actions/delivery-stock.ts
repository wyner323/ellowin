"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { sellerApplication } from "@/lib/db/schema"
import { StockError, addStockItems, removeStockItem } from "@/lib/delivery-stock"
import { parseStockLines } from "@/lib/delivery-stock-lines"
import { hitRateLimit } from "@/lib/rate-limit"
import { accountBlock, getUserId } from "@/lib/session"
import type { ActionResult } from "@/app/actions/auth"
import * as Sentry from "@sentry/nextjs"

/** Cadastro e remoção de itens do estoque de entrega automática (docs/entrega-automatica.md). Só o vendedor dono, nunca por id do cliente. */

async function requireApprovedSeller(userId: string) {
  const [application] = await db.select({ status: sellerApplication.status }).from(sellerApplication).where(eq(sellerApplication.userId, userId)).limit(1)
  return application?.status === "aprovado"
}

/** `text` é o que o vendedor colou: um item por linha. O conteúdo nunca volta na resposta nem vai para log. */
export async function addStock(variantId: number, text: string): Promise<ActionResult> {
  const userId = await getUserId()
  if (!Number.isInteger(variantId) || variantId < 1 || typeof text !== "string") return { ok: false, error: "Pedido inválido." }
  if (!(await requireApprovedSeller(userId))) return { ok: false, error: "Apenas vendedores aprovados podem cadastrar itens." }

  const blocked = await accountBlock(userId, "cadastrar itens")
  if (blocked) return blocked

  if (!(await hitRateLimit(`delivery-stock-add:${userId}`, 30, 60 * 60))) {
    return { ok: false, error: "Muitos envios em pouco tempo. Tente de novo mais tarde." }
  }

  const parsed = parseStockLines(text)
  if (parsed.errors.length > 0) {
    const shown = parsed.errors.slice(0, 5).join(" ")
    return { ok: false, field: "items", error: parsed.errors.length > 5 ? `${shown} (e mais ${parsed.errors.length - 5} problemas)` : shown }
  }
  if (parsed.items.length === 0) return { ok: false, field: "items", error: "Informe ao menos um item, um por linha." }

  try {
    const { added, ignored } = await addStockItems(userId, variantId, parsed.items)
    const skipped = ignored + parsed.duplicates
    revalidatePath("/painel/vendedor/produtos")
    revalidatePath("/painel/vendedor/produtos/[id]/estoque", "page")
    revalidatePath("/painel/vendedor")
    const base = `${added} ${added === 1 ? "item cadastrado" : "itens cadastrados"}.`
    return { ok: true, message: skipped > 0 ? `${base} ${skipped} repetido${skipped === 1 ? "" : "s"} ${skipped === 1 ? "foi ignorado" : "foram ignorados"}.` : base }
  } catch (error) {
    if (error instanceof StockError) return { ok: false, error: error.message }
    Sentry.captureException(error)
    return { ok: false, error: "Não foi possível cadastrar os itens agora. Tente de novo em instantes." }
  }
}

/** Apaga um item ainda não vendido do próprio estoque. */
export async function removeStock(itemId: number): Promise<ActionResult> {
  const userId = await getUserId()
  if (!Number.isInteger(itemId) || itemId < 1) return { ok: false, error: "Pedido inválido." }
  if (!(await requireApprovedSeller(userId))) return { ok: false, error: "Apenas vendedores aprovados podem alterar o estoque." }

  if (!(await hitRateLimit(`delivery-stock-remove:${userId}`, 200, 60 * 60))) {
    return { ok: false, error: "Muitas remoções em pouco tempo. Tente de novo mais tarde." }
  }

  try {
    await removeStockItem(userId, itemId)
    revalidatePath("/painel/vendedor/produtos")
    revalidatePath("/painel/vendedor/produtos/[id]/estoque", "page")
    return { ok: true, message: "Item removido do estoque." }
  } catch (error) {
    if (error instanceof StockError) return { ok: false, error: error.message }
    Sentry.captureException(error)
    return { ok: false, error: "Não foi possível remover o item agora. Tente de novo em instantes." }
  }
}
