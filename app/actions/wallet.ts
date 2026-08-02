"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { sellerApplication } from "@/lib/db/schema"
import { formatCents, parseToCents } from "@/lib/money"
import { getUserId } from "@/lib/session"
import { creditAvailable, debitAvailable, withTransaction } from "@/lib/wallet"
import type { ActionResult } from "@/app/actions/auth"

const MAX_DEPOSIT_CENTS = 500_000 // R$ 5.000 por depósito de demonstração

/**
 * Depósito de demonstração.
 *
 * A carteira do Ellowin é interna: enquanto não há gateway conectado, o saldo
 * é creditado aqui para que os fluxos de custódia, disputa e reembolso possam
 * ser exercitados de ponta a ponta.
 */
export async function addFunds(amount: string): Promise<ActionResult> {
  const userId = await getUserId()

  const cents = parseToCents(amount)
  if (cents === null || cents < 500)
    return { ok: false, field: "amount", error: "O depósito mínimo é R$ 5,00." }
  if (cents > MAX_DEPOSIT_CENTS)
    return {
      ok: false,
      field: "amount",
      error: `O depósito máximo é ${formatCents(MAX_DEPOSIT_CENTS)}.`,
    }

  await withTransaction((client) =>
    creditAvailable(client, userId, cents, "deposito", "Depósito na carteira"),
  )

  revalidatePath("/carteira")
  return { ok: true, message: `${formatCents(cents)} adicionados à sua carteira.` }
}

/** Saque para a chave Pix cadastrada, limitado ao saldo disponível. */
export async function requestWithdrawal(amount: string): Promise<ActionResult> {
  const userId = await getUserId()

  const cents = parseToCents(amount)
  if (cents === null || cents < 1000)
    return { ok: false, field: "amount", error: "O saque mínimo é R$ 10,00." }

  const [seller] = await db
    .select({ pixKey: sellerApplication.pixKey })
    .from(sellerApplication)
    .where(eq(sellerApplication.userId, userId))
    .limit(1)

  if (!seller?.pixKey)
    return {
      ok: false,
      error: "Cadastre uma chave Pix no seu perfil de vendedor antes de sacar.",
    }

  try {
    await withTransaction((client) =>
      debitAvailable(
        client,
        userId,
        cents,
        "saque",
        `Saque via Pix para ${seller.pixKey}`,
      ),
    )
  } catch {
    return { ok: false, field: "amount", error: "Saldo disponível insuficiente." }
  }

  revalidatePath("/carteira")
  return { ok: true, message: `Saque de ${formatCents(cents)} solicitado.` }
}
