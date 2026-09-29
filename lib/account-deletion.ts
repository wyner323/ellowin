import { and, eq, inArray, or, sql } from "drizzle-orm"
import { db, pool } from "@/lib/db"
import { order, product, user, wallet } from "@/lib/db/schema"

/**
 * Exclusão de conta (LGPD, direito de exclusão/anonimização — ver a seção 6 de
 * /termos). Não é um DELETE de verdade: pedidos, avaliações e o extrato de
 * outras pessoas apontam para esta linha, e o CPF/documento precisam ficar
 * guardados pelo prazo legal de retenção fiscal e antifraude mesmo depois do
 * pedido. O que muda: login fica impossível, o nome e o apelido públicos viram
 * um placeholder, e os dados de contato (telefone) são apagados.
 */

export type DeletionBlocker = { code: string; message: string }

const ACTIVE_ORDER_STATUSES = ["aguardando_entrega", "entregue", "em_disputa"]

/** O que falta resolver antes de poder excluir a conta. Lista vazia = pode prosseguir. */
export async function getDeletionBlockers(userId: string): Promise<DeletionBlocker[]> {
  const blockers: DeletionBlocker[] = []

  const [staff] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1)
  if (staff && staff.role !== "user") {
    blockers.push({
      code: "staff",
      message: "Contas de moderação e administração não podem se autoexcluir. Peça a outro administrador para trocar seu cargo antes.",
    })
    // Nenhuma outra checagem importa se a conta é de moderação.
    return blockers
  }

  const [w] = await db
    .select({ availableCents: wallet.availableCents, heldCents: wallet.heldCents })
    .from(wallet)
    .where(eq(wallet.userId, userId))
    .limit(1)
  if (w && (w.availableCents > 0 || w.heldCents > 0)) {
    blockers.push({
      code: "wallet",
      message: "Você tem saldo na carteira (disponível ou em custódia). Saque ou utilize o valor antes de excluir a conta.",
    })
  }

  const [activeOrders] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(order)
    .where(
      and(
        or(eq(order.buyerId, userId), eq(order.sellerId, userId)),
        inArray(order.status, ACTIVE_ORDER_STATUSES),
      ),
    )
  if ((activeOrders?.n ?? 0) > 0) {
    blockers.push({
      code: "orders",
      message: "Você tem pedidos em andamento (aguardando entrega, entregues ou em disputa). Finalize-os antes de excluir a conta.",
    })
  }

  const [activeListings] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(product)
    .where(and(eq(product.sellerId, userId), eq(product.status, "ativo")))
  if ((activeListings?.n ?? 0) > 0) {
    blockers.push({
      code: "listings",
      message: 'Você tem anúncios ativos. Pause-os ou remova-os em "Meus anúncios" antes de excluir a conta.',
    })
  }

  return blockers
}

/**
 * Anonimiza a conta e derruba o acesso. Assume que `getDeletionBlockers()` já
 * voltou vazio — chamar sem checar de novo é um bug de quem chama, não algo
 * que esta função deveria adivinhar (a checagem lê várias tabelas; refazê-la
 * aqui dentro de uma transação só trava linhas à toa).
 */
export async function anonymizeAccount(userId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // Placeholder de email único (a coluna é UNIQUE) — nunca reaproveitável por outra conta.
    await client.query(
      `UPDATE "user"
          SET "name" = 'Usuário excluído',
              "displayName" = NULL,
              "email" = 'excluido+' || "id" || '@ellowin.invalid',
              "emailVerified" = false,
              "image" = NULL,
              "bio" = NULL,
              "bannerUrl" = NULL,
              "accentColor" = NULL,
              "deletedAt" = now(),
              "updatedAt" = now()
        WHERE "id" = $1`,
      [userId],
    )

    // Telefone não precisa do prazo de retenção fiscal; CPF/nome legal ficam
    // (comentário no schema explica o porquê).
    await client.query(
      `UPDATE "profile" SET "phone" = NULL, "phoneVerified" = false, "updatedAt" = now() WHERE "userId" = $1`,
      [userId],
    )

    // Login fica impossível: sem sessão e sem credencial (senha) ou vínculo social.
    await client.query(`DELETE FROM "session" WHERE "userId" = $1`, [userId])
    await client.query(`DELETE FROM "account" WHERE "userId" = $1`, [userId])

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
