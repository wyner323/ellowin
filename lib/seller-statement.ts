import { pool } from "@/lib/db"
import { currentMonth, fillMonths, monthKeys, type StatementMonth } from "@/lib/statement-math"

/** Quantos meses o extrato cobre (a página e o CSV). */
export const STATEMENT_MONTHS = 12

const TZ = "America/Sao_Paulo"

/**
 * Vendas concluídas do vendedor por mês (Brasília) nos últimos `months` meses, do mais recente ao mais antigo, com os
 * meses sem venda zerados. Só `status = 'concluido'` entra: é o valor que de fato foi liberado ao vendedor. Valor bruto
 * é o que o comprador pagou, taxa é a da plataforma e líquido é o que o vendedor recebeu (as três vêm do próprio pedido).
 */
export async function getMonthlyStatement(sellerId: string, months = STATEMENT_MONTHS): Promise<StatementMonth[]> {
  const keys = monthKeys(currentMonth(), months)
  const oldest = keys[keys.length - 1]

  const { rows } = await pool.query<{ month: string; sales: number; gross: string; fee: string; net: string }>(
    `SELECT to_char(((o."completedAt" AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}'), 'YYYY-MM') AS month,
            count(*)::int AS sales,
            sum(o."amountCents")::bigint AS gross,
            sum(o."feeCents")::bigint AS fee,
            sum(o."sellerNetCents")::bigint AS net
       FROM "order" o
      WHERE o."sellerId" = $1
        AND o."status" = 'concluido'
        AND o."completedAt" IS NOT NULL
        AND to_char(((o."completedAt" AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}'), 'YYYY-MM') >= $2
      GROUP BY 1`,
    [sellerId, oldest],
  )

  return fillMonths(
    rows.map((r) => ({ month: r.month, sales: r.sales, grossCents: Number(r.gross), feeCents: Number(r.fee), netCents: Number(r.net) })),
    keys,
  )
}
