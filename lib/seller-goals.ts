import { pool } from "@/lib/db"

/**
 * Meta de receita do mês de um vendedor e quanto ele já vendeu neste mês (calendário de Brasília).
 * Se a tabela `seller_goal` ainda não existir (migração 0010 pendente), `available` fica falso e o painel esconde o
 * cartão em vez de quebrar.
 */

export type MonthProgressInputs = {
  available: boolean
  goalCents: number | null
  /** receita líquida das vendas concluídas do dia 1 até hoje */
  revenueCents: number
  dayOfMonth: number
  daysInMonth: number
  /** YYYY-MM, para o título ("outubro de 2026") */
  month: string
}

const TZ = "America/Sao_Paulo"
const TODAY = `(now() AT TIME ZONE '${TZ}')::date`

export async function getMonthProgressInputs(sellerId: string): Promise<MonthProgressInputs> {
  const { rows } = await pool.query<{ revenue: string; day: number; days: number; month: string }>(
    `SELECT coalesce(sum(o."sellerNetCents"), 0)::bigint::text AS revenue,
            extract(day FROM ${TODAY})::int AS day,
            extract(day FROM (date_trunc('month', ${TODAY}) + interval '1 month' - interval '1 day'))::int AS days,
            to_char(${TODAY}, 'YYYY-MM') AS month
       FROM "order" o
      WHERE o."sellerId" = $1 AND o."status" = 'concluido' AND o."completedAt" IS NOT NULL
        AND (((o."completedAt") AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}')::date >= date_trunc('month', ${TODAY})::date`,
    [sellerId],
  )
  const base = { revenueCents: Number(rows[0].revenue), dayOfMonth: rows[0].day, daysInMonth: rows[0].days, month: rows[0].month }

  try {
    const goal = await pool.query<{ cents: number }>(`SELECT "monthlyGoalCents" AS cents FROM "seller_goal" WHERE "userId" = $1`, [sellerId])
    return { ...base, available: true, goalCents: goal.rows[0] ? Number(goal.rows[0].cents) : null }
  } catch {
    return { ...base, available: false, goalCents: null }
  }
}

/** Grava a meta do mês (`null` apaga). Devolve falso se a tabela ainda não existe. */
export async function saveMonthlyGoal(sellerId: string, goalCents: number | null): Promise<boolean> {
  try {
    if (goalCents === null) {
      await pool.query(`DELETE FROM "seller_goal" WHERE "userId" = $1`, [sellerId])
    } else {
      await pool.query(
        `INSERT INTO "seller_goal" ("userId", "monthlyGoalCents", "updatedAt") VALUES ($1, $2, now())
         ON CONFLICT ("userId") DO UPDATE SET "monthlyGoalCents" = EXCLUDED."monthlyGoalCents", "updatedAt" = now()`,
        [sellerId, goalCents],
      )
    }
    return true
  } catch (error) {
    console.error("[seller-goals] não salvou a meta:", error instanceof Error ? error.message : error)
    return false
  }
}
