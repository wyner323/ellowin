import { timingSafeEqual } from "node:crypto"
import * as Sentry from "@sentry/nextjs"
import { NextResponse } from "next/server"
import { purgeExpiredRows } from "@/lib/housekeeping"
import { runWalletReconciliation } from "@/lib/reconcile"
import { alertIfReconciliationBroken } from "@/lib/reconcile-alert"
import { sweepAutoRelease, sweepDeliveryDeadline, sweepDisputeSla } from "@/lib/sla-sweeps"

/** Comparação em tempo constante: `!==` vaza, pelo tempo de resposta, quantos caracteres do segredo batem. */
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * O corpo da resposta vai para o log do GitHub Actions (.github/workflows/sla-sweep.yml), e o
 * repositório é público: nada de texto de exceção (SQL, nomes de tabela, host do banco) nem o nome
 * das conferências da carteira que falharam. O detalhe fica no log do servidor e no Sentry; quem
 * administra recebe o e-mail da conferência e vê /admin/conferencia.
 */
const FAILED = "falhou"

function report(step: string, reason: unknown) {
  console.error(`[cron/sla] ${step} falhou:`, reason)
  Sentry.captureException(reason, { tags: { cron: step } })
  return FAILED
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

  // Depois das varreduras (que movem dinheiro): confere se a carteira continua batendo.
  // Só lê; se algo não bater, alerta os admins (no máximo 1 email por dia por problema).
  const reconciliation = await runWalletReconciliation()
    .then(async (result) => {
      await alertIfReconciliationBroken(result)
      // Só quantas conferências falharam; quais são, só o admin vê (e-mail e /admin/conferencia).
      return { ok: result.ok, problems: result.findings.length }
    })
    .catch((error) => ({ ok: false as const, error: report("conferência", error) }))

  // Faxina de sessões/códigos vencidos. Não mexe em dinheiro: se falhar, vai para o Sentry mas não derruba a rotina.
  const housekeeping = await purgeExpiredRows().catch((error) => ({ error: report("faxina", error) }))

  const disputeError = disputeResult.status === "rejected" ? report("disputas", disputeResult.reason) : null
  const deliveryError = deliveryResult.status === "rejected" ? report("entrega", deliveryResult.reason) : null
  const autoReleaseError =
    autoReleaseResult.status === "rejected" ? report("liberação automática", autoReleaseResult.reason) : null

  // Uma etapa que quebrou devolve 500: o workflow fica vermelho (e o GitHub avisa) em vez de verde.
  // Conferência com problemas NÃO é erro da rotina: o alerta já foi enviado e a resposta só traz a contagem.
  const failed = Boolean(disputeError || deliveryError || autoReleaseError || "error" in reconciliation)

  return NextResponse.json(
    {
      ok: !failed,
      reconciliation,
      housekeeping,
      disputeProcessed: disputeResult.status === "fulfilled" ? disputeResult.value : null,
      disputeError,
      deliveryProcessed: deliveryResult.status === "fulfilled" ? deliveryResult.value : null,
      deliveryError,
      autoReleaseProcessed: autoReleaseResult.status === "fulfilled" ? autoReleaseResult.value : null,
      autoReleaseError,
    },
    { status: failed ? 500 : 200 },
  )
}
