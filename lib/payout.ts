import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { sellerApplication } from "@/lib/db/schema"
import { maskPixKey } from "@/lib/pix"

export type PayoutState =
  /** Não é vendedor aprovado ou ainda não cadastrou chave Pix. */
  | { kind: "unavailable"; reason: "not_seller" | "no_pix" }
  /** Chave Pix trocada há menos de 24h: saques bloqueados. */
  | { kind: "locked"; destination: string; pixType: string; secondsLeft: number }
  | { kind: "ready"; destination: string; pixType: string }

/**
 * Situação do destino de saque do usuário, para a tela da carteira. Espelha as
 * regras de `requestWithdrawal` (vendedor aprovado + Pix + trava de 24h), que
 * continuam sendo a defesa de verdade: isto só decide o que mostrar.
 * A chave nunca sai daqui inteira — só mascarada.
 */
export async function getPayoutState(userId: string): Promise<PayoutState> {
  const [row] = await db
    .select({
      status: sellerApplication.status,
      pixKey: sellerApplication.pixKey,
      pixKeyType: sellerApplication.pixKeyType,
      // Relógio do banco, igual ao requestWithdrawal (evita defasagem de fuso do servidor).
      secondsLeft: sql<number>`greatest(0, coalesce(extract(epoch from (${sellerApplication.pixKeyChangedAt} + interval '24 hours' - now())), 0))::float`,
    })
    .from(sellerApplication)
    .where(eq(sellerApplication.userId, userId))
    .limit(1)

  if (!row || row.status !== "aprovado") return { kind: "unavailable", reason: "not_seller" }
  if (!row.pixKey) return { kind: "unavailable", reason: "no_pix" }

  const destination = maskPixKey(row.pixKeyType, row.pixKey)
  const pixType = row.pixKeyType ?? ""

  if (row.secondsLeft > 0)
    return { kind: "locked", destination, pixType, secondsLeft: row.secondsLeft }
  return { kind: "ready", destination, pixType }
}
