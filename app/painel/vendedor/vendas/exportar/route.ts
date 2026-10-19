import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { centsToDecimal, toCsv } from "@/lib/csv"
import { parsePeriod } from "@/lib/analytics-math"
import { db, pool } from "@/lib/db"
import { sellerApplication } from "@/lib/db/schema"
import { ORDER_STATUS_LABEL } from "@/lib/orders"
import { publicNameRaw } from "@/lib/public-name"
import { hitRateLimit } from "@/lib/rate-limit"
import { getSession } from "@/lib/session"

/**
 * Exporta as vendas do vendedor logado em CSV (planilha). Só os pedidos DELE, nome público do comprador (nunca o nome
 * legal, e-mail ou CPF), no máximo 5.000 linhas, e com limite de pedidos por hora.
 *
 * `?periodo=7|30|90` limita pelo dia da compra (Brasília); `?periodo=todos` exporta tudo; `?status=` filtra por status.
 */
const MAX_ROWS = 5000
const TZ = "America/Sao_Paulo"

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.user) return new NextResponse("Entre na sua conta para exportar.", { status: 401 })
  const userId = session.user.id

  const [application] = await db.select({ status: sellerApplication.status }).from(sellerApplication).where(eq(sellerApplication.userId, userId)).limit(1)
  if (!application || application.status !== "aprovado") return new NextResponse("Apenas vendedores aprovados podem exportar.", { status: 403 })

  if (!(await hitRateLimit(`export-sales:${userId}`, 10, 60 * 60)))
    return new NextResponse("Muitas exportações em pouco tempo. Tente de novo mais tarde.", { status: 429 })

  const url = new URL(request.url)
  const periodParam = url.searchParams.get("periodo")
  const all = periodParam === "todos"
  const days = parsePeriod(periodParam ?? undefined)
  const statusParam = url.searchParams.get("status")
  const status = statusParam && Object.hasOwn(ORDER_STATUS_LABEL, statusParam) ? statusParam : null

  const local = (col: string) => `((${col}) AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}'`
  const stamp = (col: string) => `to_char(${local(col)}, 'DD/MM/YYYY HH24:MI')`

  const { rows } = await pool.query<{
    id: number
    created: string
    status: string
    title: string
    variant: string
    buyer: string
    gross: number
    fee: number
    net: number
    delivered: string | null
    completed: string | null
  }>(
    `SELECT o."id", ${stamp('o."createdAt"')} AS created, o."status", o."productTitle" AS title, o."variantLabel" AS variant,
            ${publicNameRaw("b")} AS buyer, o."amountCents" AS gross, o."feeCents" AS fee, o."sellerNetCents" AS net,
            ${stamp('o."deliveredAt"')} AS delivered, ${stamp('o."completedAt"')} AS completed
       FROM "order" o JOIN "user" b ON b."id" = o."buyerId"
      WHERE o."sellerId" = $1
        AND ($2::boolean OR (${local('o."createdAt"')})::date >= (now() AT TIME ZONE '${TZ}')::date - ($3::int - 1))
        AND ($4::text IS NULL OR o."status" = $4)
      ORDER BY o."createdAt" DESC, o."id" DESC
      LIMIT ${MAX_ROWS}`,
    [userId, all, days, status],
  )

  const csv = toCsv(
    ["Pedido", "Data da compra", "Situação", "Anúncio", "Variação", "Comprador", "Valor pago (R$)", "Taxa Ellowin (R$)", "Seu líquido (R$)", "Entregue em", "Concluído em"],
    rows.map((r) => [
      r.id,
      r.created,
      ORDER_STATUS_LABEL[r.status] ?? r.status,
      r.title,
      r.variant,
      r.buyer,
      centsToDecimal(Number(r.gross)),
      centsToDecimal(Number(r.fee)),
      centsToDecimal(Number(r.net)),
      r.delivered,
      r.completed,
    ]),
  )

  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vendas-ellowin-${all ? "todas" : `${days}d`}-${today}.csv"`,
      "Cache-Control": "private, no-store",
    },
  })
}
