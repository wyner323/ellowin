import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { sweepAutoRelease, sweepDeliveryDeadline, sweepDisputeSla } from "@/lib/sla"

/** Comparação em tempo constante: `!==` vaza, pelo tempo de resposta, quantos caracteres do segredo batem. */
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

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
  if (!secret || !safeEqual(authHeader ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // Os três sweeps atuam em conjuntos de status mutuamente exclusivos
  // (em_disputa vs. aguardando_entrega vs. entregue), então rodam em paralelo
  // com segurança. allSettled em vez de Promise.all: uma falha num não pode
  // impedir os outros de serem reportados.
  const [disputeResult, deliveryResult, autoReleaseResult] = await Promise.allSettled([
    sweepDisputeSla(),
    sweepDeliveryDeadline(),
    sweepAutoRelease(),
  ])

  return NextResponse.json({
    ok: true,
    disputeProcessed: disputeResult.status === "fulfilled" ? disputeResult.value : null,
    disputeError: disputeResult.status === "rejected" ? String(disputeResult.reason) : null,
    deliveryProcessed: deliveryResult.status === "fulfilled" ? deliveryResult.value : null,
    deliveryError: deliveryResult.status === "rejected" ? String(deliveryResult.reason) : null,
    autoReleaseProcessed:
      autoReleaseResult.status === "fulfilled" ? autoReleaseResult.value : null,
    autoReleaseError:
      autoReleaseResult.status === "rejected" ? String(autoReleaseResult.reason) : null,
  })
}
