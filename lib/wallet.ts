import type { PoolClient } from "pg"
import { desc, eq } from "drizzle-orm"
import { db, pool } from "@/lib/db"
import { wallet, walletTransaction } from "@/lib/db/schema"

/**
 * Carteira com custódia (escrow).
 *
 * Regras que não podem ser quebradas:
 * - Toda movimentação de dinheiro roda dentro de UMA transação SQL. Nunca
 *   existe um estado intermediário em que o dinheiro saiu de um lado e ainda
 *   não entrou no outro.
 * - As linhas de carteira envolvidas são travadas com `FOR UPDATE`, então duas
 *   compras simultâneas não conseguem gastar o mesmo saldo.
 * - Cada operação grava uma linha no extrato (`wallet_transaction`), que é
 *   append-only: o extrato é a fonte de auditoria.
 */

export type WalletKind =
  | "deposito"
  | "saque"
  | "compra"
  | "custodia"
  | "venda"
  | "reembolso"
  | "taxa"

type WalletRow = {
  userId: string
  availableCents: number
  heldCents: number
}

/** Roda `fn` dentro de BEGIN/COMMIT, com ROLLBACK em qualquer erro. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

/** Garante que a carteira existe e devolve a linha travada para escrita. */
export async function lockWallet(
  client: PoolClient,
  userId: string,
): Promise<WalletRow> {
  await client.query(
    `INSERT INTO "wallet" ("userId") VALUES ($1) ON CONFLICT ("userId") DO NOTHING`,
    [userId],
  )

  const { rows } = await client.query<WalletRow>(
    `SELECT "userId", "availableCents", "heldCents"
       FROM "wallet" WHERE "userId" = $1 FOR UPDATE`,
    [userId],
  )

  return rows[0]
}

async function writeEntry(
  client: PoolClient,
  entry: {
    userId: string
    kind: WalletKind
    amountCents: number
    balanceAfterCents: number
    orderId?: number | null
    description?: string | null
  },
) {
  await client.query(
    `INSERT INTO "wallet_transaction"
       ("userId", "orderId", "kind", "amountCents", "balanceAfterCents", "description")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.userId,
      entry.orderId ?? null,
      entry.kind,
      entry.amountCents,
      entry.balanceAfterCents,
      entry.description ?? null,
    ],
  )
}

async function setBalances(
  client: PoolClient,
  userId: string,
  availableCents: number,
  heldCents: number,
) {
  await client.query(
    `UPDATE "wallet"
        SET "availableCents" = $2, "heldCents" = $3, "updatedAt" = now()
      WHERE "userId" = $1`,
    [userId, availableCents, heldCents],
  )
}

/** Crédito no saldo disponível (depósito de demonstração, ajuste, etc.). */
export async function creditAvailable(
  client: PoolClient,
  userId: string,
  amountCents: number,
  kind: WalletKind,
  description: string,
  orderId?: number | null,
) {
  const w = await lockWallet(client, userId)
  const available = w.availableCents + amountCents

  await setBalances(client, userId, available, w.heldCents)
  await writeEntry(client, {
    userId,
    kind,
    amountCents,
    balanceAfterCents: available,
    orderId,
    description,
  })

  return available
}

/** Débito do saldo disponível (saque). Lança se não houver saldo. */
export async function debitAvailable(
  client: PoolClient,
  userId: string,
  amountCents: number,
  kind: WalletKind,
  description: string,
) {
  const w = await lockWallet(client, userId)
  if (w.availableCents < amountCents) throw new Error("Saldo insuficiente")

  const available = w.availableCents - amountCents

  await setBalances(client, userId, available, w.heldCents)
  await writeEntry(client, {
    userId,
    kind,
    amountCents: -amountCents,
    balanceAfterCents: available,
    description,
  })

  return available
}

/**
 * Compra: tira do saldo disponível do comprador e coloca em custódia.
 * O dinheiro não vai para o vendedor ainda.
 */
export async function moveToEscrow(
  client: PoolClient,
  buyerId: string,
  amountCents: number,
  description: string,
  orderId?: number | null,
) {
  const w = await lockWallet(client, buyerId)
  if (w.availableCents < amountCents) throw new Error("Saldo insuficiente")

  const available = w.availableCents - amountCents
  const held = w.heldCents + amountCents

  await setBalances(client, buyerId, available, held)
  await writeEntry(client, {
    userId: buyerId,
    kind: "custodia",
    amountCents: -amountCents,
    balanceAfterCents: available,
    orderId,
    description,
  })

  return { availableCents: available, heldCents: held }
}

/**
 * Libera a custódia para o vendedor, descontando a taxa da plataforma.
 * Sai do `heldCents` do comprador e entra no `availableCents` do vendedor.
 */
export async function releaseEscrowToSeller(
  client: PoolClient,
  args: {
    buyerId: string
    sellerId: string
    amountCents: number
    feeCents: number
    sellerNetCents: number
    orderId: number
    description: string
  },
) {
  // Bruto menos taxa tem que ser exatamente o líquido gravado no pedido. Se não
  // fechar, algo divergiu entre o cálculo da compra e o da liberação.
  if (args.amountCents - args.feeCents !== args.sellerNetCents) {
    throw new Error("Divergência entre valor bruto, taxa e líquido do pedido")
  }

  // O comprador NÃO recebe lançamento aqui: o débito dele já foi registrado
  // como "custodia" no momento da compra. Só zeramos a custódia — lançar de
  // novo faria o extrato somar o mesmo valor duas vezes.
  const buyerWallet = await lockWallet(client, args.buyerId)
  const held = Math.max(0, buyerWallet.heldCents - args.amountCents)

  await setBalances(client, args.buyerId, buyerWallet.availableCents, held)

  // Do lado do vendedor entra o valor BRUTO e sai a taxa em seguida, para que a
  // soma dos lançamentos seja igual à variação real do saldo.
  const sellerWallet = await lockWallet(client, args.sellerId)
  const grossAvailable = sellerWallet.availableCents + args.amountCents

  await setBalances(client, args.sellerId, grossAvailable, sellerWallet.heldCents)
  await writeEntry(client, {
    userId: args.sellerId,
    kind: "venda",
    amountCents: args.amountCents,
    balanceAfterCents: grossAvailable,
    orderId: args.orderId,
    description: args.description,
  })

  if (args.feeCents <= 0) return grossAvailable

  const sellerAvailable = grossAvailable - args.feeCents

  await setBalances(client, args.sellerId, sellerAvailable, sellerWallet.heldCents)
  await writeEntry(client, {
    userId: args.sellerId,
    kind: "taxa",
    amountCents: -args.feeCents,
    balanceAfterCents: sellerAvailable,
    orderId: args.orderId,
    description: "Taxa da plataforma",
  })

  return sellerAvailable
}

/**
 * Reembolso: devolve a custódia ao comprador.
 *
 * Só o valor daquele pedido sai de `heldCents` — o saldo disponível do vendedor
 * nunca é tocado, como manda a regra de disputa.
 */
export async function refundEscrow(
  client: PoolClient,
  buyerId: string,
  amountCents: number,
  orderId: number,
  description: string,
) {
  const w = await lockWallet(client, buyerId)
  const held = Math.max(0, w.heldCents - amountCents)
  const available = w.availableCents + amountCents

  await setBalances(client, buyerId, available, held)
  await writeEntry(client, {
    userId: buyerId,
    kind: "reembolso",
    amountCents,
    balanceAfterCents: available,
    orderId,
    description,
  })

  return { availableCents: available, heldCents: held }
}

/* ---------------------------------------------------------------------------
 * Leitura (fora de transação)
 * ------------------------------------------------------------------------ */

export async function getWalletSummary(userId: string) {
  const [row] = await db
    .select()
    .from(wallet)
    .where(eq(wallet.userId, userId))
    .limit(1)

  return {
    availableCents: row?.availableCents ?? 0,
    heldCents: row?.heldCents ?? 0,
  }
}

export async function getWalletEntries(userId: string, limit = 30) {
  return db
    .select()
    .from(walletTransaction)
    .where(eq(walletTransaction.userId, userId))
    .orderBy(desc(walletTransaction.createdAt))
    .limit(limit)
}
