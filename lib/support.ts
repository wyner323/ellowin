/**
 * Canal de contato da central de ajuda.
 *
 * Não há endereço fixo no código de propósito: o canal e o horário são decisão
 * da operação e só devem aparecer na tela quando existirem. Defina na Vercel
 * `ELLOWIN_SUPPORT_EMAIL` (e, opcionalmente, `ELLOWIN_SUPPORT_HOURS`); a página
 * lê no momento do acesso, então não precisa de novo deploy.
 */

export type SupportContact = {
  email: string | null
  /** Texto livre, ex.: "Segunda a sexta, das 9h às 18h". Só é exibido junto com o e-mail. */
  hours: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
const MAX_HOURS_LENGTH = 120

export function parseSupportContact(env: Record<string, string | undefined>): SupportContact {
  const email = env.ELLOWIN_SUPPORT_EMAIL?.trim() ?? ""
  const hours = env.ELLOWIN_SUPPORT_HOURS?.trim() ?? ""

  return {
    email: EMAIL_RE.test(email) ? email : null,
    hours: hours ? hours.slice(0, MAX_HOURS_LENGTH) : null,
  }
}

export function getSupportContact(): SupportContact {
  return parseSupportContact(process.env)
}
