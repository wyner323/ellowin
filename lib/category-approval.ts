import type { PoolClient } from "@neondatabase/serverless"
import { pool } from "@/lib/db"
import { categories } from "@/lib/catalog"
import { RESTRICTED_CATEGORY_SLUGS, categoryRule, isRestrictedCategory } from "@/lib/category-rules"

/**
 * Aprovação do vendedor por categoria (tabela `seller_category_approval`, migração 0015). Categorias com `restricted` em
 * lib/category-rules.ts só aceitam anúncio de quem a moderação aprovou. Enquanto a migração não foi aplicada a tabela não
 * existe: as categorias restritas ficam INDISPONÍVEIS (nunca liberadas por falta de tabela), e as demais seguem normais.
 */

export type ApprovalStatus = "pendente" | "aprovado" | "recusado"

export type CategoryApproval = {
  id: number
  userId: string
  categorySlug: string
  status: ApprovalStatus
  statement: string
  decisionNote: string | null
  decidedAt: Date | null
  stockReview: boolean
  createdAt: Date
}

/**
 * Categorias que já aceitavam anúncio de qualquer vendedor aprovado ANTES da análise existir. Até a migração 0015 criar a
 * tabela de aprovações elas continuam abertas (senão o deploy travaria as vendas de gift cards que já existem); depois,
 * a própria migração aprova quem já vendia e o resto precisa pedir. Categorias novas e restritas nunca abrem sem a tabela.
 */
const LEGACY_OPEN_CATEGORIES = ["gift-cards"]

type Queryable = Pick<PoolClient, "query">

/** A tabela de aprovações existe? (`false` até a migração 0015.) */
export async function categoryApprovalAvailable(client: Queryable = pool): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(`SELECT to_regclass('public.seller_category_approval') IS NOT NULL AS ok`)
  return rows[0]?.ok === true
}

const COLUMNS = `"id", "userId", "categorySlug", "status", "statement", "decisionNote", "decidedAt", "stockReview", "createdAt"`

/** Aprovações de um vendedor (uma por categoria restrita que ele já pediu). Vazio sem a tabela. */
export async function getSellerApprovals(userId: string): Promise<{ available: boolean; rows: CategoryApproval[] }> {
  if (!(await categoryApprovalAvailable())) return { available: false, rows: [] }
  const { rows } = await pool.query<CategoryApproval>(
    `SELECT ${COLUMNS} FROM "seller_category_approval" WHERE "userId" = $1 ORDER BY "categorySlug"`,
    [userId],
  )
  return { available: true, rows }
}

/** Categorias em que o vendedor pode publicar agora: as livres e as restritas já aprovadas. */
export async function sellableCategorySlugs(userId: string): Promise<string[]> {
  const free = categories.filter((c) => !isRestrictedCategory(c.slug)).map((c) => c.slug)
  const { available, rows } = await getSellerApprovals(userId)
  if (!available) return [...free, ...LEGACY_OPEN_CATEGORIES]
  const approved = rows.filter((r) => r.status === "aprovado").map((r) => r.categorySlug)
  return [...free, ...approved.filter((slug) => RESTRICTED_CATEGORY_SLUGS.includes(slug))]
}

/**
 * O vendedor pode ter anúncio ativo nesta categoria? Categoria livre sempre; restrita só com aprovação (e a tabela existindo).
 * Aceita o `client` de uma transação, para a compra conferir no mesmo instante em que cobra.
 */
export async function sellerMayList(userId: string, categorySlug: string, client: Queryable = pool): Promise<boolean> {
  if (!categoryRule(categorySlug).restricted) return true
  if (!(await categoryApprovalAvailable(client))) return LEGACY_OPEN_CATEGORIES.includes(categorySlug)
  const { rows } = await client.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM "seller_category_approval" WHERE "userId" = $1 AND "categorySlug" = $2 AND "status" = 'aprovado') AS ok`,
    [userId, categorySlug],
  )
  return rows[0]?.ok === true
}

/** A análise do estoque novo está ligada para este vendedor nesta categoria? Sem aprovação registrada, sim (o lado seguro). */
export async function stockNeedsReview(userId: string, categorySlug: string, client: Queryable = pool): Promise<boolean> {
  if (!categoryRule(categorySlug).stockReview) return false
  if (!(await categoryApprovalAvailable(client))) return true
  const { rows } = await client.query<{ stockReview: boolean }>(
    `SELECT "stockReview" FROM "seller_category_approval" WHERE "userId" = $1 AND "categorySlug" = $2 AND "status" = 'aprovado'`,
    [userId, categorySlug],
  )
  return rows[0]?.stockReview ?? true
}

export type PendingApproval = CategoryApproval & { sellerName: string; storeName: string | null; completedSales: number }

/** Fila da moderação: pedidos pendentes primeiro, depois as decisões mais recentes. */
export async function listApprovalQueue(limit = 100): Promise<{ available: boolean; pending: PendingApproval[]; decided: PendingApproval[] }> {
  if (!(await categoryApprovalAvailable())) return { available: false, pending: [], decided: [] }
  const { rows } = await pool.query<PendingApproval>(
    `SELECT a."id", a."userId", a."categorySlug", a."status", a."statement", a."decisionNote", a."decidedAt", a."stockReview", a."createdAt",
            u."name" AS "sellerName", s."storeName",
            (SELECT count(*)::int FROM "order" o WHERE o."sellerId" = a."userId" AND o."status" = 'concluido') AS "completedSales"
       FROM "seller_category_approval" a
       JOIN "user" u ON u."id" = a."userId"
       LEFT JOIN "seller_application" s ON s."userId" = a."userId"
      ORDER BY (a."status" = 'pendente') DESC, COALESCE(a."decidedAt", a."createdAt") DESC
      LIMIT $1`,
    [limit],
  )
  return { available: true, pending: rows.filter((r) => r.status === "pendente"), decided: rows.filter((r) => r.status !== "pendente") }
}
