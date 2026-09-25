import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { notificationLog, user } from "@/lib/db/schema"
import { actionTemplate, sendMail } from "@/lib/email"
import { notificationsLive } from "@/lib/notify"
import { findingsFingerprint, type ReconciliationReport } from "@/lib/reconcile"
import { SITE_URL } from "@/lib/site"

/**
 * Se a conferência achou algo, avisa os administradores por email — uma vez por dia
 * para o MESMO conjunto de problemas (a varredura roda a cada 15 minutos), e de novo
 * se os problemas mudarem. O email só resume; os detalhes ficam em /admin/conferencia.
 */
export async function alertIfReconciliationBroken(report: ReconciliationReport) {
  if (report.ok) return { alerted: false }

  const summary = report.findings.map((f) => `• ${f.description} (${f.rows.length})`).join("\n")
  console.error("[reconcile] a carteira NÃO bate:\n" + summary)

  if (!notificationsLive()) return { alerted: false }

  const day = report.checkedAt.toISOString().slice(0, 10)
  const refId = `${day}:${findingsFingerprint(report.findings)}`
  const admins = await db.select({ id: user.id, email: user.email }).from(user).where(eq(user.role, "admin"))

  let sent = 0
  for (const admin of admins) {
    const [claimed] = await db
      .insert(notificationLog)
      .values({ userId: admin.id, kind: "reconcile_alert", refId })
      .onConflictDoNothing()
      .returning({ id: notificationLog.id })
    if (!claimed) continue

    const result = await sendMail(
      admin.email,
      "Alerta: a carteira da Ellowin não bate",
      actionTemplate({
        title: "A conferência da carteira encontrou problemas",
        intro: summary.replace(/\n/g, " ") + " — confira os detalhes e investigue antes que mais pedidos sejam afetados.",
        buttonLabel: "Abrir a conferência",
        buttonUrl: `${SITE_URL}/admin/conferencia`,
        footnote: "A conferência só lê os dados e não corrige nada. Este alerta sai no máximo uma vez por dia para o mesmo conjunto de problemas.",
      }),
      "alerta de conferência da carteira",
    )
    if (result.sent) sent += 1
    else await db.delete(notificationLog).where(and(eq(notificationLog.id, claimed.id)))
  }
  return { alerted: sent > 0 }
}
