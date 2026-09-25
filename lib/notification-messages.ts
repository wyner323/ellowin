import { formatCents } from "@/lib/money"
import { formatDeadline } from "@/lib/order-hints"

/**
 * Texto dos emails de pedido, disputa e pergunta. Puro (sem banco, sem envio),
 * para poder ser testado. Regras que valem para TODOS os emails:
 *   - nunca inclui os dados de entrega (login/senha/códigos): o email é um canal
 *     inseguro, o comprador vê isso só dentro do site;
 *   - só nomes públicos (apelido/loja), nunca o nome legal nem o email da outra parte;
 *   - sempre um link para a tela onde a pessoa age.
 */

export type OrderNotifyKind =
  | "order_created"
  | "order_delivered"
  | "order_completed"
  | "order_auto_completed"
  | "order_cancelled"
  | "order_refunded_deadline"
  | "dispute_opened"
  | "dispute_resolved"
  | "dispute_auto_refunded"

export type OrderContext = {
  orderId: number
  productTitle: string
  variantLabel: string
  amountCents: number
  sellerNetCents: number
  buyerName: string
  sellerName: string
  deliveryDueAt: Date | null
  /** Só em dispute_resolved. */
  outcome?: "comprador" | "vendedor"
  /** Quem cancelou, só em order_cancelled. */
  cancelledBy?: "comprador" | "vendedor"
}

export type Message = {
  recipient: "buyer" | "seller"
  subject: string
  title: string
  intro: string
  buttonLabel: string
  /** Caminho no site; o domínio é colocado no envio. */
  path: string
}

const order = (c: OrderContext) => `#${c.orderId} — ${c.productTitle} (${c.variantLabel})`

export function composeOrderMessages(kind: OrderNotifyKind, c: OrderContext): Message[] {
  const path = `/pedidos/${c.orderId}`
  const disputePath = `/pedidos/${c.orderId}/disputa`
  const money = formatCents(c.amountCents)
  const net = formatCents(c.sellerNetCents)

  switch (kind) {
    case "order_created":
      return [
        {
          recipient: "seller",
          subject: `Nova venda: ${c.productTitle}`,
          title: "Você tem uma venda nova",
          intro: `${c.buyerName} comprou ${order(c)}. O valor (${net} para você, já descontada a taxa) está em custódia e é liberado depois que ele confirmar a entrega. ${
            c.deliveryDueAt
              ? `Entregue até ${formatDeadline(c.deliveryDueAt)}: passado o prazo, o comprador é reembolsado automaticamente.`
              : "Entregue o quanto antes."
          }`,
          buttonLabel: "Entregar o pedido",
          path,
        },
        {
          recipient: "buyer",
          subject: `Compra realizada: ${c.productTitle}`,
          title: "Compra realizada",
          intro: `Você comprou ${order(c)} por ${money}. O valor fica em custódia e só chega ao vendedor depois que você confirmar o recebimento. Assim que ele entregar, avisamos por aqui.`,
          buttonLabel: "Ver o pedido",
          path,
        },
      ]

    case "order_delivered":
      return [
        {
          recipient: "buyer",
          subject: `Seu pedido foi entregue: ${c.productTitle}`,
          title: "Confira e confirme o recebimento",
          intro: `${c.sellerName} registrou a entrega de ${order(c)}. Os dados estão dentro do pedido no site (por segurança, não vão por email). Confira se está tudo certo e confirme o recebimento; se algo estiver errado, abra uma disputa antes de confirmar.`,
          buttonLabel: "Abrir o pedido",
          path,
        },
      ]

    case "order_completed":
      return [
        {
          recipient: "seller",
          subject: `Pagamento liberado: ${c.productTitle}`,
          title: "Pagamento liberado",
          intro: `${c.buyerName} confirmou o recebimento de ${order(c)}. ${net} já estão no seu saldo disponível.`,
          buttonLabel: "Ver minha carteira",
          path: "/carteira",
        },
      ]

    case "order_auto_completed":
      return [
        {
          recipient: "seller",
          subject: `Pagamento liberado: ${c.productTitle}`,
          title: "Pagamento liberado automaticamente",
          intro: `O prazo de confirmação de ${order(c)} terminou sem ação do comprador, então o valor foi liberado: ${net} estão no seu saldo disponível.`,
          buttonLabel: "Ver minha carteira",
          path: "/carteira",
        },
        {
          recipient: "buyer",
          subject: `Pagamento liberado ao vendedor: ${c.productTitle}`,
          title: "Pedido concluído automaticamente",
          intro: `O prazo para confirmar o recebimento de ${order(c)} terminou e o pagamento foi liberado ao vendedor. Se houve algum problema, fale com o suporte.`,
          buttonLabel: "Ver o pedido",
          path,
        },
      ]

    case "order_cancelled":
      return [
        {
          recipient: "buyer",
          subject: `Pedido cancelado: ${c.productTitle}`,
          title: "Pedido cancelado e valor devolvido",
          intro: `O pedido ${order(c)} foi cancelado ${c.cancelledBy === "vendedor" ? "pelo vendedor" : "por você"}. ${money} voltaram para o seu saldo.`,
          buttonLabel: "Ver minha carteira",
          path: "/carteira",
        },
        {
          recipient: "seller",
          subject: `Pedido cancelado: ${c.productTitle}`,
          title: "Pedido cancelado",
          intro: `O pedido ${order(c)} foi cancelado ${c.cancelledBy === "comprador" ? "pelo comprador" : "por você"} antes da entrega. O estoque do item foi reposto.`,
          buttonLabel: "Ver o pedido",
          path,
        },
      ]

    case "order_refunded_deadline":
      return [
        {
          recipient: "buyer",
          subject: `Reembolso automático: ${c.productTitle}`,
          title: "Você foi reembolsado",
          intro: `O vendedor não entregou ${order(c)} dentro do prazo prometido. ${money} voltaram para o seu saldo.`,
          buttonLabel: "Ver minha carteira",
          path: "/carteira",
        },
        {
          recipient: "seller",
          subject: `Pedido reembolsado por atraso: ${c.productTitle}`,
          title: "Prazo de entrega vencido",
          intro: `O prazo de entrega de ${order(c)} venceu e o comprador foi reembolsado automaticamente. Atrasos assim pesam na sua reputação.`,
          buttonLabel: "Ver o pedido",
          path,
        },
      ]

    case "dispute_opened":
      return [
        {
          recipient: "seller",
          subject: `Disputa aberta no pedido #${c.orderId}`,
          title: "O comprador abriu uma disputa",
          intro: `${c.buyerName} abriu uma disputa sobre ${order(c)}. Só o valor deste pedido (${money}) fica bloqueado. Responda no chat da disputa em até 48 horas úteis: sem resposta, o comprador é reembolsado automaticamente.`,
          buttonLabel: "Responder a disputa",
          path: disputePath,
        },
        {
          recipient: "buyer",
          subject: `Disputa aberta no pedido #${c.orderId}`,
          title: "Sua disputa foi aberta",
          intro: `Registramos a disputa sobre ${order(c)}. O vendedor tem 48 horas úteis para responder e o suporte da Ellowin entra em contato em até 24 horas. O valor continua em custódia.`,
          buttonLabel: "Acompanhar a disputa",
          path: disputePath,
        },
      ]

    case "dispute_resolved": {
      const forBuyer = c.outcome === "comprador"
      return [
        {
          recipient: "buyer",
          subject: `Disputa encerrada: pedido #${c.orderId}`,
          title: forBuyer ? "Disputa decidida a seu favor" : "Disputa decidida a favor do vendedor",
          intro: forBuyer
            ? `A moderação decidiu a seu favor no pedido ${order(c)}: ${money} voltaram para o seu saldo.`
            : `A moderação decidiu a favor do vendedor no pedido ${order(c)}, e o pagamento foi liberado a ele. A justificativa está no chat da disputa.`,
          buttonLabel: "Ver a decisão",
          path: disputePath,
        },
        {
          recipient: "seller",
          subject: `Disputa encerrada: pedido #${c.orderId}`,
          title: forBuyer ? "Disputa decidida a favor do comprador" : "Disputa decidida a seu favor",
          intro: forBuyer
            ? `A moderação decidiu a favor do comprador no pedido ${order(c)}, e o valor foi devolvido a ele. A justificativa está no chat da disputa.`
            : `A moderação decidiu a seu favor no pedido ${order(c)}: ${net} estão no seu saldo disponível.`,
          buttonLabel: "Ver a decisão",
          path: disputePath,
        },
      ]
    }

    case "dispute_auto_refunded":
      return [
        {
          recipient: "buyer",
          subject: `Reembolso automático: pedido #${c.orderId}`,
          title: "Você foi reembolsado",
          intro: `O vendedor não respondeu à disputa de ${order(c)} dentro de 48 horas úteis. ${money} voltaram para o seu saldo.`,
          buttonLabel: "Ver minha carteira",
          path: "/carteira",
        },
        {
          recipient: "seller",
          subject: `Disputa perdida por falta de resposta: pedido #${c.orderId}`,
          title: "O prazo de resposta terminou",
          intro: `Você não respondeu à disputa de ${order(c)} dentro de 48 horas úteis, então o comprador foi reembolsado automaticamente.`,
          buttonLabel: "Ver a disputa",
          path: disputePath,
        },
      ]
  }
}

export function composeQuestionMessage(
  kind: "question_asked" | "question_answered",
  c: { productTitle: string; productSlug: string; askerName: string; text: string },
): Message {
  const preview = c.text.length > 300 ? `${c.text.slice(0, 297)}…` : c.text
  return kind === "question_asked"
    ? {
        recipient: "seller",
        subject: `Nova pergunta em ${c.productTitle}`,
        title: "Uma pessoa perguntou sobre o seu anúncio",
        intro: `${c.askerName} perguntou em “${c.productTitle}”: “${preview}” — quem responde rápido vende mais.`,
        buttonLabel: "Responder",
        path: "/painel/vendedor/perguntas?filtro=pendentes",
      }
    : {
        recipient: "buyer",
        subject: `Sua pergunta foi respondida: ${c.productTitle}`,
        title: "O vendedor respondeu",
        intro: `Sobre “${c.productTitle}”: “${preview}”`,
        buttonLabel: "Ver o anúncio",
        path: `/produtos/${c.productSlug}`,
      }
}
