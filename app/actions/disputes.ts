"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { dispute, order } from "@/lib/db/schema"
import { DISPUTE_REASONS } from "@/lib/disputes"
import { getDisputeMessages } from "@/lib/orders"
import { formatCents } from "@/lib/money"
import { getStaff } from "@/lib/roles"
import { getUserId } from "@/lib/session"
import { disputeDeadlines } from "@/lib/sla"
import { refundEscrow, releaseEscrowToSeller, withTransaction } from "@/lib/wallet"
import type { ActionResult } from "@/app/actions/auth"

/**
 * Abertura de disputa pelo comprador.
 *
 * Só o valor DESTE pedido fica bloqueado — ele já está em `heldCents` desde a
 * compra, então nada é retirado do saldo disponível do vendedor. Foi a decisão
 * acordada: bloquear a carteira inteira por uma disputa pequena é injusto.
 */
export async function openDispute(input: {
  orderId: number
  reason: string
  description: string
}): Promise<ActionResult & { disputeId?: number }> {
  const buyerId = await getUserId()

  const [row] = await db
    .select()
    .from(order)
    .where(and(eq(order.id, input.orderId), eq(order.buyerId, buyerId)))
    .limit(1)

  if (!row) return { ok: false, error: "Pedido não encontrado." }
  if (!["aguardando_entrega", "entregue"].includes(row.status))
    return {
      ok: false,
      error: "Este pedido não está em uma etapa que permita abrir disputa.",
    }

  if (!DISPUTE_REASONS.some((r) => r.value === input.reason))
    return { ok: false, field: "reason", error: "Escolha o motivo da disputa." }

  const description = input.description.trim()
  if (description.length < 20)
    return {
      ok: false,
      field: "description",
      error: "Explique o problema com pelo menos 20 caracteres.",
    }

  const openedAt = new Date()
  const deadlines = disputeDeadlines(openedAt)

  const disputeId = await withTransaction(async (client) => {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO "dispute"
         ("orderId", "openedBy", "reason", "description", "status",
          "firstContactDueAt", "sellerResponseDueAt", "resolutionDueAt")
       VALUES ($1, $2, $3, $4, 'aberta', $5, $6, $7)
       RETURNING "id"`,
      [
        row.id,
        buyerId,
        input.reason,
        description,
        deadlines.firstContactDueAt,
        deadlines.sellerResponseDueAt,
        deadlines.resolutionDueAt,
      ],
    )

    const newId = inserted.rows[0].id

    await client.query(`UPDATE "order" SET "status" = 'em_disputa' WHERE "id" = $1`, [
      row.id,
    ])

    await client.query(
      `INSERT INTO "dispute_message" ("disputeId", "authorRole", "body")
       VALUES ($1, 'system', $2)`,
      [
        newId,
        `Disputa aberta. ${formatCents(row.amountCents)} referentes a este pedido seguem bloqueados em custódia. O vendedor tem 48h úteis para resolver e o suporte da Ellowin entra em contato em até 24h.`,
      ],
    )

    await client.query(
      `INSERT INTO "dispute_message" ("disputeId", "authorId", "authorRole", "body")
       VALUES ($1, $2, 'buyer', $3)`,
      [newId, buyerId, description],
    )

    return newId
  })

  revalidatePath(`/pedidos/${row.id}`)
  revalidatePath("/pedidos")
  revalidatePath("/painel/vendedor/vendas")
  revalidatePath("/admin/disputas")

  return { ok: true, message: "Disputa aberta. O chat com o vendedor está disponível.", disputeId }
}

type Participation = {
  role: "buyer" | "seller" | "moderator"
  orderId: number
  disputeStatus: string
}

/** Descobre em que papel o usuário participa da disputa. */
async function resolveParticipation(disputeId: number): Promise<Participation | null> {
  const userId = await getUserId()

  const [row] = await db
    .select({
      orderId: dispute.orderId,
      disputeStatus: dispute.status,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
    })
    .from(dispute)
    .innerJoin(order, eq(order.id, dispute.orderId))
    .where(eq(dispute.id, disputeId))
    .limit(1)

  if (!row) return null

  if (row.buyerId === userId)
    return { role: "buyer", orderId: row.orderId, disputeStatus: row.disputeStatus }
  if (row.sellerId === userId)
    return { role: "seller", orderId: row.orderId, disputeStatus: row.disputeStatus }

  const staff = await getStaff()
  if (staff)
    return { role: "moderator", orderId: row.orderId, disputeStatus: row.disputeStatus }

  return null
}

/**
 * Nova mensagem no chat da disputa.
 *
 * A primeira mensagem do vendedor grava `sellerFirstResponseAt`, que é o que
 * desarma o reembolso automático por SLA. Notas internas (`internal`) só podem
 * ser escritas pela moderação e nunca aparecem para as partes.
 */
export async function postDisputeMessage(input: {
  disputeId: number
  body: string
  internal?: boolean
}): Promise<ActionResult> {
  const userId = await getUserId()
  const participation = await resolveParticipation(input.disputeId)

  if (!participation) return { ok: false, error: "Disputa não encontrada." }

  const body = input.body.trim()
  if (body.length < 2) return { ok: false, field: "body", error: "Escreva uma mensagem." }

  if (
    participation.disputeStatus.startsWith("resolvida") ||
    participation.disputeStatus === "cancelada"
  ) {
    return { ok: false, error: "Esta disputa já foi encerrada." }
  }

  const internal = Boolean(input.internal) && participation.role === "moderator"

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO "dispute_message" ("disputeId", "authorId", "authorRole", "body", "internal")
       VALUES ($1, $2, $3, $4, $5)`,
      [input.disputeId, userId, participation.role, body, internal],
    )

    if (participation.role === "seller") {
      await client.query(
        `UPDATE "dispute"
            SET "sellerFirstResponseAt" = coalesce("sellerFirstResponseAt", now())
          WHERE "id" = $1`,
        [input.disputeId],
      )
    }

    // O primeiro contato do suporte move o caso para análise e registra quem
    // atendeu, sem impedir que outro moderador continue depois.
    if (participation.role === "moderator" && !internal) {
      await client.query(
        `UPDATE "dispute"
            SET "status" = CASE WHEN "status" = 'aberta' THEN 'em_analise' ELSE "status" END,
                "moderatorId" = coalesce("moderatorId", $2)
          WHERE "id" = $1`,
        [input.disputeId, userId],
      )
    }
  })

  revalidatePath(`/pedidos/${participation.orderId}/disputa`)
  revalidatePath(`/admin/disputas/${input.disputeId}`)
  revalidatePath("/admin/disputas")

  return { ok: true }
}

/**
 * Busca as mensagens do chat para atualização em tempo real (polling).
 *
 * Revalida a participação a cada chamada, então as notas internas só voltam
 * para a moderação — o cliente nunca decide sozinho o que pode ver.
 */
export async function fetchDisputeMessages(disputeId: number) {
  const participation = await resolveParticipation(disputeId)
  if (!participation) return { ok: false as const, messages: [] }

  const messages = await getDisputeMessages(
    disputeId,
    participation.role === "moderator",
  )

  return { ok: true as const, messages }
}

/** Moderador assume o caso. O histórico continua aberto para os demais. */
export async function claimDispute(disputeId: number): Promise<ActionResult> {
  const staff = await getStaff()
  if (!staff) return { ok: false, error: "Acesso restrito à moderação." }

  await db
    .update(dispute)
    .set({ moderatorId: staff.id, status: "em_analise" })
    .where(and(eq(dispute.id, disputeId), eq(dispute.status, "aberta")))

  revalidatePath(`/admin/disputas/${disputeId}`)
  revalidatePath("/admin/disputas")

  return { ok: true, message: "Caso atribuído a você." }
}

/**
 * Decisão final da moderação.
 *
 * `comprador` devolve a custódia ao comprador; `vendedor` libera o valor ao
 * vendedor descontando a taxa. Em ambos os casos a decisão fica registrada no
 * histórico como mensagem de sistema.
 */
export async function resolveDispute(input: {
  disputeId: number
  outcome: "comprador" | "vendedor"
  note: string
}): Promise<ActionResult> {
  const staff = await getStaff()
  if (!staff) return { ok: false, error: "Acesso restrito à moderação." }

  const note = input.note.trim()
  if (note.length < 10)
    return {
      ok: false,
      field: "note",
      error: "Registre a justificativa da decisão (mínimo de 10 caracteres).",
    }

  const [row] = await db
    .select({
      disputeId: dispute.id,
      status: dispute.status,
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      productId: order.productId,
      amountCents: order.amountCents,
      feeCents: order.feeCents,
      sellerNetCents: order.sellerNetCents,
      productTitle: order.productTitle,
      variantLabel: order.variantLabel,
      orderStatus: order.status,
    })
    .from(dispute)
    .innerJoin(order, eq(order.id, dispute.orderId))
    .where(eq(dispute.id, input.disputeId))
    .limit(1)

  if (!row) return { ok: false, error: "Disputa não encontrada." }
  if (row.status.startsWith("resolvida") || row.status === "cancelada")
    return { ok: false, error: "Esta disputa já foi encerrada." }

  await withTransaction(async (client) => {
    if (input.outcome === "comprador") {
      await refundEscrow(
        client,
        row.buyerId,
        row.amountCents,
        row.orderId,
        `Reembolso por decisão de disputa — pedido #${row.orderId}`,
      )

      await client.query(
        `UPDATE "order" SET "status" = 'reembolsado', "completedAt" = now() WHERE "id" = $1`,
        [row.orderId],
      )
    } else {
      await releaseEscrowToSeller(client, {
        buyerId: row.buyerId,
        sellerId: row.sellerId,
        amountCents: row.amountCents,
        feeCents: row.feeCents,
        sellerNetCents: row.sellerNetCents,
        orderId: row.orderId,
        description: `Liberação por decisão de disputa — ${row.productTitle} (${row.variantLabel})`,
      })

      await client.query(
        `UPDATE "order" SET "status" = 'concluido', "completedAt" = now() WHERE "id" = $1`,
        [row.orderId],
      )

      await client.query(
        `UPDATE "product" SET "salesCount" = "salesCount" + 1 WHERE "id" = $1`,
        [row.productId],
      )
    }

    await client.query(
      `UPDATE "dispute"
          SET "status" = $2,
              "resolution" = $3,
              "moderatorId" = coalesce("moderatorId", $4),
              "resolvedAt" = now()
        WHERE "id" = $1`,
      [
        row.disputeId,
        input.outcome === "comprador" ? "resolvida_comprador" : "resolvida_vendedor",
        note,
        staff.id,
      ],
    )

    await client.query(
      `INSERT INTO "dispute_message" ("disputeId", "authorRole", "body")
       VALUES ($1, 'system', $2)`,
      [
        row.disputeId,
        input.outcome === "comprador"
          ? `Disputa encerrada a favor do comprador. ${formatCents(row.amountCents)} devolvidos. Justificativa: ${note}`
          : `Disputa encerrada a favor do vendedor. ${formatCents(row.sellerNetCents)} liberados. Justificativa: ${note}`,
      ],
    )
  })

  revalidatePath(`/admin/disputas/${input.disputeId}`)
  revalidatePath("/admin/disputas")
  revalidatePath(`/pedidos/${row.orderId}`)
  revalidatePath(`/pedidos/${row.orderId}/disputa`)
  revalidatePath("/carteira")

  return { ok: true, message: "Disputa encerrada." }
}
