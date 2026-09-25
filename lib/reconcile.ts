import { pool } from "@/lib/db"

/**
 * Conferência da carteira e do escrow: verifica, direto no banco, que o dinheiro
 * BATE. É o alarme para o tipo de erro que já tivemos (pagar duas vezes): se um
 * saldo deixar de bater com o extrato, ou um pedido for liquidado duas vezes, isto
 * aparece aqui antes de alguém reclamar.
 *
 * Só lê — nunca corrige nada. Cada verificação devolve as linhas que violam a regra.
 */

export type Finding = { check: string; description: string; rows: Record<string, unknown>[] }

export type ReconciliationReport = {
  ok: boolean
  checkedAt: Date
  totals: { wallets: number; orders: number; ledgerEntries: number }
  findings: Finding[]
}

type Check = { key: string; description: string; sql: string; params?: unknown[] }

/**
 * Pedidos de demonstração (dados semeados em 2026-07/08, antes do escrow existir)
 * cujo pagamento ao vendedor foi lançado SEM o débito correspondente no comprador.
 * Não são erro do sistema, mas criam dinheiro "do nada" na conta de conservação, então
 * o valor deles entra como esperado. Um pedido novo nunca entra aqui.
 */
const LEGACY_SEED_ORDER_IDS = [1, 2, 3, 4, 5]

const ACTIVE = `'aguardando_entrega','entregue','em_disputa'`

const CHECKS: Check[] = [
  {
    key: "saldo_vs_extrato",
    description: "Saldo disponível diferente da soma do extrato (a carteira não bate com o histórico)",
    sql: `SELECT w."userId", w."availableCents" AS "saldo", coalesce(s.total, 0)::int AS "somaExtrato"
            FROM "wallet" w
            LEFT JOIN (SELECT "userId", sum("amountCents") AS total FROM "wallet_transaction" GROUP BY "userId") s
              ON s."userId" = w."userId"
           WHERE w."availableCents" <> coalesce(s.total, 0)
           LIMIT 20`,
  },
  {
    // A última linha do extrato guarda o saldo depois dela; tem que ser o saldo atual.
    key: "ultimo_saldo_do_extrato",
    description: "O saldo gravado na última linha do extrato não é o saldo atual da carteira",
    sql: `SELECT w."userId", w."availableCents" AS "saldo", t."balanceAfterCents" AS "saldoNoExtrato"
            FROM "wallet" w
            JOIN LATERAL (
              SELECT "balanceAfterCents" FROM "wallet_transaction"
               WHERE "userId" = w."userId" ORDER BY "id" DESC LIMIT 1
            ) t ON true
           WHERE t."balanceAfterCents" <> w."availableCents"
           LIMIT 20`,
  },
  {
    key: "custodia_vs_pedidos",
    description: "Dinheiro em custódia do comprador diferente da soma dos pedidos ainda em andamento",
    sql: `SELECT w."userId", w."heldCents" AS "custodia", coalesce(o.total, 0)::int AS "somaPedidosAtivos"
            FROM "wallet" w
            LEFT JOIN (
              SELECT "buyerId", sum("amountCents") AS total FROM "order"
               WHERE "status" IN (${ACTIVE}) GROUP BY "buyerId"
            ) o ON o."buyerId" = w."userId"
           WHERE w."heldCents" <> coalesce(o.total, 0)
           LIMIT 20`,
  },
  {
    // Todo dinheiro do sistema = depósitos − saques − taxas. Se sobrar ou faltar, algo foi criado ou perdido.
    key: "conservacao_do_dinheiro",
    description: "Dinheiro total na plataforma (saldos + custódia) diferente de depósitos − saques − taxas",
    params: [LEGACY_SEED_ORDER_IDS],
    sql: `WITH esperado AS (
             SELECT (SELECT coalesce(sum(CASE "kind" WHEN 'deposito' THEN "amountCents" WHEN 'saque' THEN "amountCents" WHEN 'taxa' THEN "amountCents" ELSE 0 END), 0)
                       FROM "wallet_transaction")
                    + (SELECT coalesce(sum("amountCents"), 0) FROM "wallet_transaction"
                        WHERE "kind" = 'venda' AND "orderId" = ANY($1::int[])) AS total
           ), atual AS (
             SELECT coalesce(sum("availableCents" + "heldCents"), 0) AS total FROM "wallet"
           )
           SELECT atual.total::bigint AS "noSistema", esperado.total::bigint AS "esperado"
             FROM atual, esperado WHERE atual.total <> esperado.total`,
  },
  {
    key: "pedido_liquidado_duas_vezes",
    description: "Pedido com mais de um pagamento ao vendedor, mais de um reembolso, ou pago E reembolsado",
    sql: `SELECT "orderId",
                count(*) FILTER (WHERE "kind" = 'venda') AS "pagamentos",
                count(*) FILTER (WHERE "kind" = 'reembolso') AS "reembolsos"
            FROM "wallet_transaction"
           WHERE "orderId" IS NOT NULL
           GROUP BY "orderId"
          HAVING count(*) FILTER (WHERE "kind" = 'venda') > 1
              OR count(*) FILTER (WHERE "kind" = 'reembolso') > 1
              OR (count(*) FILTER (WHERE "kind" = 'venda') >= 1 AND count(*) FILTER (WHERE "kind" = 'reembolso') >= 1)
           LIMIT 20`,
  },
  {
    key: "pedido_concluido_sem_pagamento",
    description: "Pedido concluído sem exatamente um pagamento ao vendedor no extrato",
    sql: `SELECT o."id" AS "pedido", (SELECT count(*) FROM "wallet_transaction" t WHERE t."orderId" = o."id" AND t."kind" = 'venda') AS "pagamentos"
            FROM "order" o
           WHERE o."status" = 'concluido'
             AND (SELECT count(*) FROM "wallet_transaction" t WHERE t."orderId" = o."id" AND t."kind" = 'venda') <> 1
           LIMIT 20`,
  },
  {
    key: "pedido_reembolsado_sem_reembolso",
    description: "Pedido cancelado/reembolsado sem exatamente um reembolso no extrato",
    sql: `SELECT o."id" AS "pedido", o."status", (SELECT count(*) FROM "wallet_transaction" t WHERE t."orderId" = o."id" AND t."kind" = 'reembolso') AS "reembolsos"
            FROM "order" o
           WHERE o."status" IN ('reembolsado','cancelado')
             AND (SELECT count(*) FROM "wallet_transaction" t WHERE t."orderId" = o."id" AND t."kind" = 'reembolso') <> 1
           LIMIT 20`,
  },
  {
    key: "pedido_ativo_sem_custodia",
    description: "Pedido em andamento sem exatamente uma entrada em custódia no extrato",
    sql: `SELECT o."id" AS "pedido", o."status", (SELECT count(*) FROM "wallet_transaction" t WHERE t."orderId" = o."id" AND t."kind" = 'custodia') AS "custodias"
            FROM "order" o
           WHERE o."status" IN (${ACTIVE})
             AND (SELECT count(*) FROM "wallet_transaction" t WHERE t."orderId" = o."id" AND t."kind" = 'custodia') <> 1
           LIMIT 20`,
  },
  {
    key: "taxa_inconsistente",
    description: "Pedido em que valor − taxa não é o líquido do vendedor",
    sql: `SELECT "id" AS "pedido", "amountCents", "feeCents", "sellerNetCents"
            FROM "order" WHERE "amountCents" - "feeCents" <> "sellerNetCents" LIMIT 20`,
  },
  {
    key: "saldo_negativo",
    description: "Carteira com saldo ou custódia negativos",
    sql: `SELECT "userId", "availableCents", "heldCents" FROM "wallet" WHERE "availableCents" < 0 OR "heldCents" < 0 LIMIT 20`,
  },
]

export async function runWalletReconciliation(): Promise<ReconciliationReport> {
  const findings: Finding[] = []

  for (const check of CHECKS) {
    const { rows } = await pool.query(check.sql, check.params)
    if (rows.length > 0) findings.push({ check: check.key, description: check.description, rows })
  }

  const [counts] = (
    await pool.query(
      `SELECT (SELECT count(*) FROM "wallet")::int AS wallets,
              (SELECT count(*) FROM "order")::int AS orders,
              (SELECT count(*) FROM "wallet_transaction")::int AS "ledgerEntries"`,
    )
  ).rows

  return { ok: findings.length === 0, checkedAt: new Date(), totals: counts, findings }
}

/** Impressão digital dos achados: o alerta por email sai uma vez por conjunto de problemas por dia, não a cada 15 minutos. */
export function findingsFingerprint(findings: Finding[]) {
  return findings.map((f) => `${f.check}:${f.rows.length}`).sort().join("|")
}
