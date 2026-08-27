import { NextResponse } from "next/server"
import { sweepDisputeSla } from "@/lib/sla"

/**
 * Chamado pelo Vercel Cron (ver vercel.json). A Vercel injeta o header
 * Authorization automaticamente quando CRON_SECRET está configurada, então
 * essa checagem impede que qualquer pessoa dispare o sweep manualmente.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const processed = await sweepDisputeSla()
  return NextResponse.json({ ok: true, processed })
}
