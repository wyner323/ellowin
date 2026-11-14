"use server"

import { revalidatePath } from "next/cache"
import { pool } from "@/lib/db"
import { getCategory } from "@/lib/catalog"
import { categoryApprovalAvailable } from "@/lib/category-approval"
import { MAX_STATEMENT, MIN_STATEMENT, isRestrictedCategory } from "@/lib/category-rules"
import { notifyCategoryDecision } from "@/lib/notify"
import { hitRateLimit } from "@/lib/rate-limit"
import { requireStaff } from "@/lib/roles"
import { accountBlock, getUserId } from "@/lib/session"
import type { ActionResult } from "@/app/actions/auth"

const MAX_NOTE = 500

/**
 * O vendedor pede aprovação para vender numa categoria restrita (gift cards, recargas, assinaturas, keys, redes sociais).
 * A declaração (de onde vem o estoque, como faz as recargas...) é dele e a Ellowin não a confere: ela só ajuda a
 * moderação a decidir. Um pedido recusado pode ser refeito; um aprovado não precisa ser pedido de novo.
 */
export async function requestCategoryApproval(input: { categorySlug: string; statement: string }): Promise<ActionResult> {
  const userId = await getUserId()

  const [seller] = (await pool.query<{ status: string }>(`SELECT "status" FROM "seller_application" WHERE "userId" = $1`, [userId])).rows
  if (seller?.status !== "aprovado") return { ok: false, error: "Conclua o cadastro de vendedor antes de pedir uma categoria." }

  {
    const blocked = await accountBlock(userId, "pedir aprovação de categoria")
    if (blocked) return blocked
  }

  const slug = typeof input.categorySlug === "string" ? input.categorySlug : ""
  if (!getCategory(slug) || !isRestrictedCategory(slug)) return { ok: false, field: "categorySlug", error: "Essa categoria não precisa de aprovação." }

  const statement = (typeof input.statement === "string" ? input.statement : "").trim()
  if (statement.length < MIN_STATEMENT)
    return { ok: false, field: "statement", error: `Explique em pelo menos ${MIN_STATEMENT} caracteres.` }
  if (statement.length > MAX_STATEMENT) return { ok: false, field: "statement", error: `A explicação pode ter até ${MAX_STATEMENT} caracteres.` }

  if (!(await categoryApprovalAvailable())) return { ok: false, error: "A aprovação de categorias ainda não está disponível. Tente de novo mais tarde." }

  if (!(await hitRateLimit(`category-approval:${userId}`, 10, 60 * 60))) return { ok: false, error: "Muitos pedidos seguidos. Tente de novo mais tarde." }

  const { rows } = await pool.query<{ status: string }>(
    `SELECT "status" FROM "seller_category_approval" WHERE "userId" = $1 AND "categorySlug" = $2`,
    [userId, slug],
  )
  if (rows[0]?.status === "aprovado") return { ok: false, error: "Você já está aprovado nessa categoria." }

  // Pendente: só atualiza a explicação. Recusado: volta para a fila. Nunca mexe em decisão de outra pessoa.
  await pool.query(
    `INSERT INTO "seller_category_approval" ("userId", "categorySlug", "status", "statement")
     VALUES ($1, $2, 'pendente', $3)
     ON CONFLICT ("userId", "categorySlug") DO UPDATE
        SET "status" = 'pendente', "statement" = EXCLUDED."statement", "decisionNote" = NULL, "decidedBy" = NULL, "decidedAt" = NULL, "updatedAt" = now()
      WHERE "seller_category_approval"."status" <> 'aprovado'`,
    [userId, slug, statement],
  )

  revalidatePath("/painel/vendedor/categorias")
  revalidatePath("/admin/categorias")
  return { ok: true, message: "Pedido enviado. A moderação responde por aqui e por e-mail." }
}

/**
 * Decisão da moderação. Aprovar libera anúncios novos na categoria; recusar (ou revogar uma aprovação) pausa os anúncios
 * ativos do vendedor nela, porque `purchase` também confere a aprovação no momento da compra. `stockReview` liga ou desliga
 * a análise do estoque novo desse vendedor.
 */
export async function decideCategoryApproval(input: {
  approvalId: number
  decision: "aprovado" | "recusado"
  note?: string
  stockReview?: boolean
}): Promise<ActionResult> {
  const staff = await requireStaff()

  if (input.decision !== "aprovado" && input.decision !== "recusado") return { ok: false, error: "Decisão inválida." }
  const note = (input.note ?? "").trim().slice(0, MAX_NOTE)
  if (input.decision === "recusado" && note.length < 5) return { ok: false, field: "note", error: "Explique o motivo da recusa (ao menos 5 caracteres)." }
  if (!Number.isInteger(input.approvalId)) return { ok: false, error: "Pedido inválido." }

  if (!(await categoryApprovalAvailable())) return { ok: false, error: "A aprovação de categorias ainda não está disponível." }

  const { rows } = await pool.query<{ userId: string; categorySlug: string; status: string; decidedAt: Date }>(
    `UPDATE "seller_category_approval"
        SET "status" = $2, "decisionNote" = $3, "decidedBy" = $4, "decidedAt" = now(), "updatedAt" = now(),
            "stockReview" = COALESCE($5, "stockReview")
      WHERE "id" = $1
      RETURNING "userId", "categorySlug", "status", "decidedAt"`,
    [input.approvalId, input.decision, note || null, staff.id, typeof input.stockReview === "boolean" ? input.stockReview : null],
  )
  const updated = rows[0]
  if (!updated) return { ok: false, error: "Pedido não encontrado." }

  if (input.decision === "recusado") {
    await pool.query(
      `UPDATE "product" SET "status" = 'pausado', "updatedAt" = now()
        WHERE "sellerId" = $1 AND "categorySlug" = $2 AND "status" = 'ativo'`,
      [updated.userId, updated.categorySlug],
    )
  }

  notifyCategoryDecision({
    userId: updated.userId,
    categorySlug: updated.categorySlug,
    decision: input.decision,
    note: note || null,
    approvalId: input.approvalId,
    decidedAt: new Date(updated.decidedAt),
  })

  revalidatePath("/admin/categorias")
  revalidatePath("/painel/vendedor/categorias")
  revalidatePath(`/catalogo/${updated.categorySlug}`)
  return { ok: true, message: input.decision === "aprovado" ? "Categoria aprovada." : "Pedido recusado." }
}

/** Liga ou desliga a análise do estoque novo de um vendedor já aprovado (só a moderação). */
export async function setStockReview(input: { approvalId: number; stockReview: boolean }): Promise<ActionResult> {
  await requireStaff()
  if (!Number.isInteger(input.approvalId) || typeof input.stockReview !== "boolean") return { ok: false, error: "Pedido inválido." }
  if (!(await categoryApprovalAvailable())) return { ok: false, error: "A aprovação de categorias ainda não está disponível." }
  const result = await pool.query(
    `UPDATE "seller_category_approval" SET "stockReview" = $2, "updatedAt" = now() WHERE "id" = $1 AND "status" = 'aprovado'`,
    [input.approvalId, input.stockReview],
  )
  if (result.rowCount === 0) return { ok: false, error: "Só vendedores aprovados têm análise de estoque." }
  revalidatePath("/admin/categorias")
  return { ok: true, message: input.stockReview ? "Estoque novo passa por análise." : "Estoque novo entra sem análise." }
}
