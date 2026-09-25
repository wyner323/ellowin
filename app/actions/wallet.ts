"use server"

import { and, eq, gt, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { sellerApplication, walletTransaction } from "@/lib/db/schema"
import { formatCents, parseToCents } from "@/lib/money"
import { hitRateLimit } from "@/lib/rate-limit"
import { accountBlock, getUserId } from "@/lib/session"
import { creditAvailable, debitAvailable, withTransaction } from "@/lib/wallet"
import type { ActionResult } from "@/app/actions/auth"

const MAX_DEPOSIT_CENTS = 500_000 // R$ 5.000 por depósito de demonstração
const MAX_DAILY_DEPOSIT_CENTS = 1_000_000 // R$ 10.000 acumulados a cada 24h

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

  // Sem gateway, este crédito é dinheiro de mentira: sem teto, uma conta gerava
  // saldo infinito em laço e, no dia em que houver saque real, sacava. Limite
  // de frequência + teto acumulado das últimas 24h.
  if (!(await hitRateLimit(`deposit:${userId}`, 10, 60 * 60)))
    return { ok: false, field: "amount", error: "Muitos depósitos seguidos. Tente novamente mais tarde." }

  const [recent] = await db
    .select({ total: sql<number>`coalesce(sum(${walletTransaction.amountCents}), 0)::int` })
    .from(walletTransaction)
    .where(
      and(
        eq(walletTransaction.userId, userId),
        eq(walletTransaction.kind, "deposito"),
        gt(walletTransaction.createdAt, sql`now() - interval '24 hours'`),
      ),
    )
  if ((recent?.total ?? 0) + cents > MAX_DAILY_DEPOSIT_CENTS)
    return {
      ok: false,
      field: "amount",
      error: `O limite de depósitos é ${formatCents(MAX_DAILY_DEPOSIT_CENTS)} a cada 24 horas.`,
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

  {
    const blocked = await accountBlock(userId, "sacar")
    if (blocked) return blocked
  }

  const [seller] = await db
    .select({
      pixKey: sellerApplication.pixKey,
      status: sellerApplication.status,
      // Comparação no relógio do banco (evita defasagem de fuso do servidor).
      pixKeyRecentlyChanged: sql<boolean>`coalesce(${sellerApplication.pixKeyChangedAt} > now() - interval '24 hours', false)`,
    })
    .from(sellerApplication)
    .where(eq(sellerApplication.userId, userId))
    .limit(1)

  if (!seller?.pixKey || seller.status !== "aprovado")
    return {
      ok: false,
      error: "Conclua o cadastro de vendedor e cadastre uma chave Pix antes de sacar.",
    }

  // Trocar a chave Pix trava saques por 24h: é o que impede quem tomou uma
  // sessão de trocar a chave e esvaziar a carteira no mesmo minuto.
  if (seller.pixKeyRecentlyChanged)
    return {
      ok: false,
      error: "Por segurança, saques ficam bloqueados por 24 horas depois de trocar a chave Pix.",
    }

  if (!(await hitRateLimit(`withdraw:${userId}`, 5, 60 * 60)))
    return { ok: false, field: "amount", error: "Muitos pedidos de saque seguidos. Tente novamente mais tarde." }

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
