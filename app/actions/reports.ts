"use server"

import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { product, report, user } from "@/lib/db/schema"
import { findOpenReport } from "@/lib/report-queries"
import {
  isValidReportReason,
  MAX_REPORT_DESCRIPTION,
  MIN_REPORT_DESCRIPTION,
  OPEN_REPORT_STATUSES,
} from "@/lib/reports"
import { hitRateLimit } from "@/lib/rate-limit"
import { getStaff } from "@/lib/roles"
import { getUserId } from "@/lib/session"
import type { ActionResult } from "@/app/actions/auth"

function validateReasonAndDescription(reason: string, description: string) {
  if (!isValidReportReason(reason)) return "Escolha o motivo da denúncia."
  const trimmed = description.trim()
  if (trimmed.length < MIN_REPORT_DESCRIPTION)
    return `Descreva o problema com pelo menos ${MIN_REPORT_DESCRIPTION} caracteres.`
  if (trimmed.length > MAX_REPORT_DESCRIPTION)
    return `A descrição pode ter até ${MAX_REPORT_DESCRIPTION} caracteres.`
  return null
}

const ALREADY_REPORTED_MESSAGE = "Você já denunciou isso e nossa equipe está analisando."

/** Denúncia de um anúncio — golpe, procedência falsa, descrição enganosa. */
export async function reportListing(input: {
  productId: number
  reason: string
  description: string
}): Promise<ActionResult> {
  const userId = await getUserId()

  const invalid = validateReasonAndDescription(input.reason, input.description)
  if (invalid) return { ok: false, error: invalid }

  const [item] = await db
    .select({ id: product.id, sellerId: product.sellerId })
    .from(product)
    .where(eq(product.id, input.productId))
    .limit(1)
  if (!item) return { ok: false, error: "Anúncio não encontrado." }
  if (item.sellerId === userId)
    return { ok: false, error: "Você não pode denunciar o seu próprio anúncio." }

  if (await findOpenReport(userId, { productId: item.id }))
    return { ok: false, error: ALREADY_REPORTED_MESSAGE }

  if (!(await hitRateLimit(`report:${userId}`, 10, 60 * 60)))
    return { ok: false, error: "Muitas denúncias em pouco tempo. Tente novamente mais tarde." }

  await db.insert(report).values({
    reporterId: userId,
    targetType: "anuncio",
    targetProductId: item.id,
    reason: input.reason,
    description: input.description.trim(),
  })

  revalidatePath("/admin/denuncias")
  return { ok: true, message: "Denúncia enviada. Nossa equipe vai analisar." }
}

/** Denúncia de um usuário (comprador ou vendedor) — assédio, golpe fora do anúncio, conta invadida. */
export async function reportUser(input: {
  targetUserId: string
  reason: string
  description: string
}): Promise<ActionResult> {
  const userId = await getUserId()

  if (input.targetUserId === userId)
    return { ok: false, error: "Você não pode denunciar a si mesmo." }

  const invalid = validateReasonAndDescription(input.reason, input.description)
  if (invalid) return { ok: false, error: invalid }

  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, input.targetUserId)).limit(1)
  if (!target) return { ok: false, error: "Usuário não encontrado." }

  if (await findOpenReport(userId, { userId: target.id }))
    return { ok: false, error: ALREADY_REPORTED_MESSAGE }

  if (!(await hitRateLimit(`report:${userId}`, 10, 60 * 60)))
    return { ok: false, error: "Muitas denúncias em pouco tempo. Tente novamente mais tarde." }

  await db.insert(report).values({
    reporterId: userId,
    targetType: "usuario",
    targetUserId: target.id,
    reason: input.reason,
    description: input.description.trim(),
  })

  revalidatePath("/admin/denuncias")
  return { ok: true, message: "Denúncia enviada. Nossa equipe vai analisar." }
}

/**
 * O membro da moderação é parte do caso? (denunciou, é o denunciado ou é dono do
 * anúncio denunciado). Mesma regra de conflito de interesse das disputas: quem
 * é parte não assume nem decide.
 */
async function isPartyToReport(
  staffId: string,
  row: { reporterId: string; targetUserId: string | null; targetProductId: number | null },
) {
  if (row.reporterId === staffId || row.targetUserId === staffId) return true
  if (row.targetProductId === null) return false
  const [item] = await db.select({ sellerId: product.sellerId }).from(product).where(eq(product.id, row.targetProductId)).limit(1)
  return item?.sellerId === staffId
}

const reportCaseColumns = {
  status: report.status,
  reporterId: report.reporterId,
  targetUserId: report.targetUserId,
  targetProductId: report.targetProductId,
}

/** Moderador assume o caso — mesmo padrão de claimDispute: só caso em aberto, e nunca o próprio. */
export async function claimReport(reportId: number): Promise<ActionResult> {
  const staff = await getStaff()
  if (!staff) return { ok: false, error: "Acesso restrito à moderação." }

  const [row] = await db.select(reportCaseColumns).from(report).where(eq(report.id, reportId)).limit(1)
  if (!row) return { ok: false, error: "Denúncia não encontrada." }
  if (!OPEN_REPORT_STATUSES.includes(row.status as (typeof OPEN_REPORT_STATUSES)[number]))
    return { ok: false, error: "Esta denúncia já foi encerrada." }
  if (await isPartyToReport(staff.id, row))
    return { ok: false, error: "Você é parte desta denúncia e não pode assumi-la." }

  // O status no WHERE: se o caso foi encerrado entre a leitura e aqui, nada é reaberto.
  await db
    .update(report)
    .set({ moderatorId: staff.id, status: "em_analise" })
    .where(and(eq(report.id, reportId), inArray(report.status, OPEN_REPORT_STATUSES)))

  revalidatePath(`/admin/denuncias/${reportId}`)
  revalidatePath("/admin/denuncias")
  return { ok: true, message: "Caso atribuído a você." }
}

/** Decisão da moderação: confirma a irregularidade ou arquiva sem achar nada. */
export async function resolveReport(input: {
  reportId: number
  status: "resolvida" | "arquivada"
  note: string
}): Promise<ActionResult> {
  const staff = await getStaff()
  if (!staff) return { ok: false, error: "Acesso restrito à moderação." }

  // O tipo do TypeScript não vale em runtime: só os dois desfechos existem.
  if (input.status !== "resolvida" && input.status !== "arquivada")
    return { ok: false, field: "status", error: "Escolha o desfecho da denúncia." }

  const note = input.note.trim()
  if (note.length < 5)
    return { ok: false, field: "note", error: "Registre uma nota sobre a decisão (mínimo de 5 caracteres)." }
  if (note.length > MAX_REPORT_DESCRIPTION)
    return { ok: false, field: "note", error: `A nota pode ter até ${MAX_REPORT_DESCRIPTION} caracteres.` }

  const [row] = await db.select(reportCaseColumns).from(report).where(eq(report.id, input.reportId)).limit(1)
  if (!row) return { ok: false, error: "Denúncia não encontrada." }
  if (row.status === "resolvida" || row.status === "arquivada")
    return { ok: false, error: "Esta denúncia já foi encerrada." }
  if (await isPartyToReport(staff.id, row))
    return { ok: false, error: "Você é parte desta denúncia e não pode decidi-la." }

  await db
    .update(report)
    .set({
      status: input.status,
      resolutionNote: note,
      moderatorId: staff.id,
      resolvedAt: new Date(),
    })
    .where(and(eq(report.id, input.reportId), inArray(report.status, OPEN_REPORT_STATUSES)))

  revalidatePath(`/admin/denuncias/${input.reportId}`)
  revalidatePath("/admin/denuncias")
  return { ok: true, message: "Denúncia encerrada." }
}
