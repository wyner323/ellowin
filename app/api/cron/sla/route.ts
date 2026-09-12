import { NextResponse } from "next/server"
import { sweepDeliveryDeadline, sweepDisputeSla } from "@/lib/sla"

/**
 * Chamado pelo Vercel Cron (ver vercel.json). A Vercel injeta o header
 * Authorization automaticamente quando CRON_SECRET está configurada, então
 * essa checagem impede que qualquer pessoa dispare o sweep manualmente.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  // Sem CRON_SECRET configurada, `Bearer ${undefined}` viraria uma string fixa
  // e adivinhável ("Bearer undefined") — falha fechado em vez de aceitar isso.
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // Os dois sweeps atuam em conjuntos de status mutuamente exclusivos
  // (em_disputa vs. aguardando_entrega), então rodam em paralelo com
  // segurança. allSettled em vez de Promise.all: uma falha num não pode
  // impedir o outro de ser reportado.
  const [disputeResult, deliveryResult] = await Promise.allSettled([
    sweepDisputeSla(),
    sweepDeliveryDeadline(),
  ])

  return NextResponse.json({
    ok: true,
    disputeProcessed: disputeResult.status === "fulfilled" ? disputeResult.value : null,
    disputeError: disputeResult.status === "rejected" ? String(disputeResult.reason) : null,
    deliveryProcessed: deliveryResult.status === "fulfilled" ? deliveryResult.value : null,
    deliveryError: deliveryResult.status === "rejected" ? String(deliveryResult.reason) : null,
  })
}
