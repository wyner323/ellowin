"use server"

import { revalidatePath } from "next/cache"
import * as Sentry from "@sentry/nextjs"
import { batchTableExistsIn, syncStock } from "@/lib/delivery-stock"
import { pool } from "@/lib/db"
import { notifyStockDecision } from "@/lib/notify"
import { requireStaff } from "@/lib/roles"
import { withTransaction } from "@/lib/wallet"
import type { ActionResult } from "@/app/actions/auth"

const MAX_NOTE = 500

/** Transições permitidas: o que a moderação pode fazer com um lote em cada situação. */
const ALLOWED: Record<string, string[]> = {
  pendente: ["aprovado", "recusado"],
  aprovado: ["quarentena"],
  quarentena: ["aprovado", "recusado"],
  recusado: [],
}

/**
 * Decisão da moderação sobre um lote de estoque. Aprovar põe os itens à venda; recusar APAGA os itens ainda não vendidos do
 * lote (o vendedor cadastra de novo, se for o caso); quarentena tira o resto do lote da venda sem apagar. Itens já vendidos
 * não mudam. A ordem de trava é a da compra: a linha da variante primeiro, depois o lote.
 */
export async function reviewStockBatch(input: {
  batchId: number
  decision: "aprovado" | "recusado" | "quarentena"
  note?: string
}): Promise<ActionResult> {
  const staff = await requireStaff()

  if (!Number.isInteger(input.batchId)) return { ok: false, error: "Lote inválido." }
  if (!["aprovado", "recusado", "quarentena"].includes(input.decision)) return { ok: false, error: "Decisão inválida." }
  const note = (input.note ?? "").trim().slice(0, MAX_NOTE)
  if (input.decision !== "aprovado" && note.length < 5) return { ok: false, field: "note", error: "Explique o motivo (ao menos 5 caracteres)." }

  if (!(await batchTableExistsIn(pool))) return { ok: false, error: "A análise de estoque ainda não está disponível." }

  try {
    const result = await withTransaction(async (client) => {
      const found = await client.query<{ variantId: number }>(`SELECT "variantId" FROM "stock_batch" WHERE "id" = $1`, [input.batchId])
      const variantId = found.rows[0]?.variantId
      if (variantId === undefined) return "Lote não encontrado."

      await client.query(`SELECT 1 FROM "product_variant" WHERE "id" = $1 FOR UPDATE`, [variantId])
      const batch = await client.query<{ status: string }>(`SELECT "status" FROM "stock_batch" WHERE "id" = $1 FOR UPDATE`, [input.batchId])
      const current = batch.rows[0]?.status
      if (!current || !(ALLOWED[current] ?? []).includes(input.decision)) return "Este lote já foi decidido ou não aceita essa ação."

      await client.query(
        `UPDATE "stock_batch" SET "status" = $2, "reviewedBy" = $3, "reviewedAt" = now(), "reviewNote" = $4 WHERE "id" = $1`,
        [input.batchId, input.decision, staff.id, note || null],
      )
      if (input.decision === "recusado") {
        await client.query(`DELETE FROM "delivery_stock_item" WHERE "batchId" = $1 AND "orderId" IS NULL`, [input.batchId])
      }
      await syncStock(client, variantId)
      return null
    })
    if (result) return { ok: false, error: result }
  } catch (error) {
    Sentry.captureException(error)
    return { ok: false, error: "Não foi possível registrar a decisão agora. Tente de novo." }
  }

  notifyStockDecision(input.batchId)
  revalidatePath("/admin/estoque")
  revalidatePath("/painel/vendedor/produtos/[id]/estoque", "page")
  revalidatePath("/painel/vendedor/produtos")
  return { ok: true, message: input.decision === "aprovado" ? "Lote aprovado: os itens já estão à venda." : input.decision === "quarentena" ? "Lote retirado da venda." : "Lote recusado e itens apagados." }
}
