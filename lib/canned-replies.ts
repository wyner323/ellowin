/**
 * Respostas prontas do vendedor: modelos de entrega, mensagens rápidas do chat do pedido e respostas a avaliações.
 * São só texto inicial: entram na caixa de texto e o vendedor edita antes de enviar (nada é enviado sozinho).
 * Puro e sem promessas que a plataforma não cumpre (o teste barra "garantia", "24/7", "em minutos"...).
 */

export type CannedReply = { id: string; label: string; text: string }

/** Esqueletos para a caixa "Dados da entrega": o vendedor preenche os campos. */
export const DELIVERY_TEMPLATES: CannedReply[] = [
  { id: "conta", label: "Dados de conta", text: "Login: \nSenha: \nE-mail da conta: \nObservações: " },
  { id: "codigo", label: "Código de resgate", text: "Código: \nComo resgatar: " },
  { id: "passos", label: "Passo a passo", text: "Entrega feita! Siga estes passos:\n1. \n2. \n3. " },
]

/** Mensagens rápidas para o chat do pedido. */
export const CHAT_REPLIES: CannedReply[] = [
  {
    id: "preparando",
    label: "Estou preparando",
    text: "Olá! Recebi o seu pedido e já estou preparando a entrega. Assim que estiver pronta, aviso por aqui.",
  },
  {
    id: "entregue",
    label: "Já entreguei",
    text: "Os dados já estão no pedido. Confira tudo e, estando certo, confirme o recebimento. Qualquer dúvida, fale por aqui.",
  },
  { id: "preciso", label: "Preciso de um dado", text: "Para concluir a entrega, preciso que você me informe: " },
  {
    id: "atraso",
    label: "Aviso de atraso",
    text: "Peço desculpas pela espera. Estou finalizando a sua entrega e ela sai o quanto antes dentro do prazo do anúncio.",
  },
  {
    id: "agradeco",
    label: "Agradecimento",
    text: "Obrigado pela compra! Se estiver tudo certo, confirme o recebimento e, se puder, deixe uma avaliação.",
  },
]

/** Respostas públicas a avaliações. */
export const REVIEW_REPLIES: CannedReply[] = [
  { id: "obrigado", label: "Agradecer", text: "Obrigado pela avaliação e pela compra! Fico feliz que deu tudo certo. Até a próxima." },
  {
    id: "volte",
    label: "Agradecer e convidar",
    text: "Muito obrigado pelo retorno! Foi um prazer atender você. Qualquer coisa que precisar, é só chamar.",
  },
  {
    id: "desculpas",
    label: "Pedir desculpas",
    text: "Obrigado pelo retorno e sinto muito que a experiência não tenha sido a ideal. Vou usar o seu comentário para melhorar.",
  },
  {
    id: "contato",
    label: "Oferecer ajuda",
    text: "Obrigado por avaliar. Se ainda houver algo pendente, me chame pelo chat do pedido que eu cuido disso.",
  },
]

/** Acrescenta um modelo à caixa de texto: no lugar se estiver vazia, ou depois do que já foi escrito. */
export function appendReply(current: string, reply: string): string {
  if (current.trim() === "") return reply
  return `${current.replace(/\s+$/, "")}\n\n${reply}`
}
