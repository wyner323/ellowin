import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { centsToDecimal, toCsv } from "@/lib/csv"
import { db } from "@/lib/db"
import { sellerApplication } from "@/lib/db/schema"
import { hitRateLimit } from "@/lib/rate-limit"
import { getMonthlyStatement } from "@/lib/seller-statement"
import { getSession } from "@/lib/session"
import { effectiveFeePercent, totals } from "@/lib/statement-math"

/**
 * Extrato mensal de taxas em CSV: só do vendedor logado, vendas concluídas dos últimos 12 meses, uma linha por mês e o
 * total. O mês vai como "AAAA-MM" (a planilha ordena e filtra sem esforço).
 */
export async function GET() {
  const session = await getSession()
  if (!session?.user) return new NextResponse("Entre na sua conta para exportar.", { status: 401 })
  const userId = session.user.id

  const [application] = await db.select({ status: sellerApplication.status }).from(sellerApplication).where(eq(sellerApplication.userId, userId)).limit(1)
  if (!application || application.status !== "aprovado") return new NextResponse("Apenas vendedores aprovados podem exportar.", { status: 403 })

  if (!(await hitRateLimit(`export-statement:${userId}`, 10, 60 * 60)))
    return new NextResponse("Muitas exportações em pouco tempo. Tente de novo mais tarde.", { status: 429 })

  const months = await getMonthlyStatement(userId)
  const total = totals(months)
  const pct = (gross: number, fee: number) => {
    const value = effectiveFeePercent(gross, fee)
    return value === null ? "" : value.toFixed(2).replace(".", ",")
  }

  const csv = toCsv(
    ["Mês", "Vendas concluídas", "Valor pago pelos compradores (R$)", "Taxa Ellowin (R$)", "Taxa sobre o valor (%)", "Líquido recebido (R$)"],
    [
      ...months.map((m) => [m.month, m.sales, centsToDecimal(m.grossCents), centsToDecimal(m.feeCents), pct(m.grossCents, m.feeCents), centsToDecimal(m.netCents)]),
      ["Total", total.sales, centsToDecimal(total.grossCents), centsToDecimal(total.feeCents), pct(total.grossCents, total.feeCents), centsToDecimal(total.netCents)],
    ],
  )

  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="extrato-ellowin-${today}.csv"`,
      "Cache-Control": "private, no-store",
    },
  })
}
