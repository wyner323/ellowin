"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { sellerApplication } from "@/lib/db/schema"
import { formatCents, parseToCents } from "@/lib/money"
import { hitRateLimit } from "@/lib/rate-limit"
import { saveMonthlyGoal } from "@/lib/seller-goals"
import { getUserId } from "@/lib/session"
import type { ActionResult } from "@/app/actions/auth"

const MIN_GOAL_CENTS = 5_000 // R$ 50,00
const MAX_GOAL_CENTS = 1_000_000_000 // R$ 10.000.000,00 (cabe no inteiro do banco)

/**
 * Define (ou apaga, com o campo vazio) a meta de receita líquida do mês. Só vendedor aprovado, só a própria meta.
 */
export async function setMonthlyGoal(amount: string): Promise<ActionResult> {
  const userId = await getUserId()

  const [application] = await db.select({ status: sellerApplication.status }).from(sellerApplication).where(eq(sellerApplication.userId, userId)).limit(1)
  if (!application || application.status !== "aprovado") return { ok: false, error: "Apenas vendedores aprovados podem definir uma meta." }

  if (!(await hitRateLimit(`seller-goal:${userId}`, 20, 60 * 60))) return { ok: false, error: "Muitas alterações em pouco tempo. Tente de novo mais tarde." }

  const text = (amount ?? "").trim()
  let cents: number | null = null
  if (text !== "") {
    cents = parseToCents(text)
    if (cents === null || cents < MIN_GOAL_CENTS)
      return { ok: false, field: "amount", error: `Informe um valor de pelo menos ${formatCents(MIN_GOAL_CENTS)}, ou deixe vazio para remover a meta.` }
    if (cents > MAX_GOAL_CENTS) return { ok: false, field: "amount", error: `O valor máximo é ${formatCents(MAX_GOAL_CENTS)}.` }
  }

  if (!(await saveMonthlyGoal(userId, cents))) return { ok: false, error: "Não foi possível salvar a meta agora. Tente de novo em instantes." }

  revalidatePath("/painel/vendedor")
  return { ok: true, message: cents === null ? "Meta removida." : `Meta do mês definida: ${formatCents(cents)}.` }
}
