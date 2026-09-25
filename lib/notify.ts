import { after } from "next/server"
import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { notificationLog, order, product, productQuestion, user } from "@/lib/db/schema"
import { actionTemplate, sendMail } from "@/lib/email"
import {
  composeOrderMessages,
  composeQuestionMessage,
  type Message,
  type OrderNotifyKind,
} from "@/lib/notification-messages"
import { SITE_URL } from "@/lib/site"

/**
 * Emails de acompanhamento (venda nova, entrega, pagamento liberado, reembolso,
 * disputa, pergunta). Regras:
 *  - roda DEPOIS da resposta (`after`) e nunca lança: um email que falha não pode
 *    derrubar nem desfazer uma compra, entrega ou reembolso;
 *  - cada (usuário, tipo, referência) sai no máximo uma vez (`notification_log`),
 *    então varreduras repetidas ou cliques duplos não mandam o mesmo email de novo;
 *  - FORA da produção só registra no log, sem enviar: o banco local é o de
 *    produção, e testar um fluxo não pode mandar email para gente de verdade.
 *    ELLOWIN_NOTIFY=1 força o envio (para testar o template de propósito).
 */

export function notificationsLive() {
  return (
    (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production") ||
    process.env.ELLOWIN_NOTIFY === "1"
  )
}

function schedule(task: () => Promise<void>) {
  const run = () =>
    task().catch((error) => console.error("[notify] falha ao notificar:", error))
  try {
    after(run)
  } catch {
    // Fora de um request do Next (scripts, testes): roda direto, sem esperar.
    void run()
  }
}

async function deliver(userId: string, kind: string, refId: string, message: Message) {
  if (!notificationsLive()) {
    console.log(`[notify:simulado] ${kind} ${refId} → usuário ${userId}: ${message.subject}`)
    return
  }

  // Reserva o envio antes de mandar: o índice único faz só uma chamada vencer.
  const [claimed] = await db
    .insert(notificationLog)
    .values({ userId, kind, refId })
    .onConflictDoNothing()
    .returning({ id: notificationLog.id })
  if (!claimed) return

  const [recipient] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!recipient?.email) return

  const result = await sendMail(
    recipient.email,
    message.subject,
    actionTemplate({
      title: message.title,
      intro: message.intro,
      buttonLabel: message.buttonLabel,
      buttonUrl: `${SITE_URL}${message.path}`,
      footnote:
        "Você recebe este email por causa de uma atividade na sua conta Ellowin. Por segurança, nunca pedimos senhas nem dados de acesso por email.",
    }),
    kind,
  )

  // Falhou: libera a reserva para uma próxima tentativa poder enviar.
  if (!result.sent) await db.delete(notificationLog).where(eq(notificationLog.id, claimed.id))
}

/** Avisa comprador e/ou vendedor de um pedido. `extra` só é usado por alguns tipos. */
export function notifyOrder(
  kind: OrderNotifyKind,
  orderId: number,
  extra: { outcome?: "comprador" | "vendedor"; cancelledBy?: "comprador" | "vendedor" } = {},
) {
  schedule(async () => {
    const [row] = await db
      .select({
        orderId: order.id,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        productTitle: order.productTitle,
        variantLabel: order.variantLabel,
        amountCents: order.amountCents,
        sellerNetCents: order.sellerNetCents,
        deliveryDueAt: order.deliveryDueAt,
        buyerName: sql<string>`(select coalesce(u."displayName", u."name") from "user" u where u."id" = ${order.buyerId})`,
        sellerName: sql<string>`coalesce(
          (select s."storeName" from "seller_application" s where s."userId" = ${order.sellerId}),
          (select coalesce(u."displayName", u."name") from "user" u where u."id" = ${order.sellerId})
        )`,
      })
      .from(order)
      .where(eq(order.id, orderId))
      .limit(1)
    if (!row) return

    const messages = composeOrderMessages(kind, { ...row, ...extra })
    await Promise.all(
      messages.map((m) =>
        deliver(m.recipient === "buyer" ? row.buyerId : row.sellerId, kind, `order:${orderId}`, m),
      ),
    )
  })
}

/** Pergunta nova (avisa o vendedor) ou resposta (avisa quem perguntou). */
export function notifyQuestion(kind: "question_asked" | "question_answered", questionId: number) {
  schedule(async () => {
    const [row] = await db
      .select({
        question: productQuestion.question,
        answer: productQuestion.answer,
        askerId: productQuestion.askerId,
        sellerId: product.sellerId,
        productTitle: product.title,
        productSlug: product.slug,
        askerName: sql<string>`(select coalesce(u."displayName", u."name") from "user" u where u."id" = ${productQuestion.askerId})`,
      })
      .from(productQuestion)
      .innerJoin(product, eq(product.id, productQuestion.productId))
      .where(eq(productQuestion.id, questionId))
      .limit(1)
    if (!row) return

    const message = composeQuestionMessage(kind, {
      productTitle: row.productTitle,
      productSlug: row.productSlug,
      askerName: row.askerName ?? "Alguém",
      text: kind === "question_asked" ? row.question : (row.answer ?? ""),
    })
    await deliver(
      message.recipient === "seller" ? row.sellerId : row.askerId,
      kind,
      `question:${questionId}`,
      message,
    )
  })
}
