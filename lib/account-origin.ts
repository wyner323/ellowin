/**
 * Procedência declarada de uma conta de jogo — só se aplica à categoria
 * "contas". O eixo que importa pro comprador não é só "quem criou a conta",
 * é se o vendedor ainda tem em mãos os dados que permitem retomá-la depois
 * da venda (o golpe mais comum nesse tipo de marketplace).
 */
export type AccountOriginId =
  | "criador_sem_recuperacao"
  | "criador_com_recuperacao"
  | "comprado_sem_recuperacao"
  | "comprado_com_recuperacao"

export const ACCOUNT_ORIGIN_OPTIONS: {
  id: AccountOriginId
  label: string
  retainsRecoveryData: boolean
}[] = [
  {
    id: "criador_sem_recuperacao",
    label: "Sou o criador da conta — sem dados de recuperação comigo",
    retainsRecoveryData: false,
  },
  {
    id: "comprado_sem_recuperacao",
    label: "Comprei de outro jogador/loja — sem dados de recuperação comigo",
    retainsRecoveryData: false,
  },
  {
    id: "criador_com_recuperacao",
    label: "Sou o criador da conta — ainda tenho dados de recuperação",
    retainsRecoveryData: true,
  },
  {
    id: "comprado_com_recuperacao",
    label: "Comprei de outro jogador/loja — ainda tenho dados de recuperação",
    retainsRecoveryData: true,
  },
]

const OPTION_BY_ID = new Map(ACCOUNT_ORIGIN_OPTIONS.map((o) => [o.id, o]))

export function accountOriginLabel(id: string | null) {
  return id ? (OPTION_BY_ID.get(id as AccountOriginId)?.label ?? null) : null
}

/** true = o vendedor declarou que ainda pode recuperar a conta — maior risco pro comprador. */
export function accountOriginRetainsRecoveryData(id: string | null) {
  if (!id) return false
  return OPTION_BY_ID.get(id as AccountOriginId)?.retainsRecoveryData ?? false
}

export function isValidAccountOrigin(id: string): id is AccountOriginId {
  return OPTION_BY_ID.has(id as AccountOriginId)
}
