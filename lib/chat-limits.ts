/**
 * Tetos dos chats de pedido e de disputa. As telas leem a conversa inteira a cada atualização, então
 * sem teto uma conta que só manda mensagem faz o banco e a página da outra parte crescerem sem fim.
 * Valem para o comprador e o vendedor; a moderação não é limitada.
 */
export const MAX_CHAT_MESSAGES_PER_HOUR = 100
export const MAX_CHAT_MESSAGES_PER_THREAD = 500

export const CHAT_RATE_MESSAGE = "Muitas mensagens em pouco tempo. Aguarde um pouco e envie de novo."
export const CHAT_FULL_MESSAGE = "Esta conversa chegou ao limite de mensagens. Se precisa de ajuda, fale com o suporte pela Central de ajuda."
