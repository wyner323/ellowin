import { aliasedTable, and, desc, eq, inArray, notInArray, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { product, report, user } from "@/lib/db/schema"
import { PAGE_SIZE, resolvePage } from "@/lib/pagination"

/**
 * Consultas da fila de denúncias — separado de lib/marketplace.ts/lib/orders.ts
 * só porque nenhum dos dois é claramente "o lugar certo"; mesmo padrão de
 * getDisputeQueue em lib/orders.ts (fila aberta inteira, encerradas paginadas).
 */

const reporter = aliasedTable(user, "reporter")
const targetUser = aliasedTable(user, "target_user")

function publicNameCol(t: typeof user) {
  return sql<string>`coalesce(${t.displayName}, ${t.name})`
}

const reportColumns = {
  id: report.id,
  targetType: report.targetType,
  reason: report.reason,
  description: report.description,
  status: report.status,
  moderatorId: report.moderatorId,
  resolutionNote: report.resolutionNote,
  createdAt: report.createdAt,
  resolvedAt: report.resolvedAt,
  reporterName: publicNameCol(reporter),
  targetProductId: report.targetProductId,
  targetProductTitle: product.title,
  targetProductSlug: product.slug,
  targetUserId: report.targetUserId,
  targetUserName: publicNameCol(targetUser),
}

/** Fila de denúncias da moderação. Sem opções, devolve a fila aberta inteira (mesmo padrão de disputas: é fila de trabalho, não histórico). */
export async function getReportQueue(
  opts: {
    statuses?: string[]
    excludeStatuses?: string[]
    limit?: number
    offset?: number
  } = {},
) {
  const conditions = []
  if (opts.statuses?.length) conditions.push(inArray(report.status, opts.statuses))
  if (opts.excludeStatuses?.length) conditions.push(notInArray(report.status, opts.excludeStatuses))

  return db
    .select(reportColumns)
    .from(report)
    .leftJoin(reporter, eq(reporter.id, report.reporterId))
    .leftJoin(product, eq(product.id, report.targetProductId))
    .leftJoin(targetUser, eq(targetUser.id, report.targetUserId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(report.createdAt), desc(report.id))
    .limit(opts.limit ?? 1000)
    .offset(opts.offset ?? 0)
}

/** Página de denúncias encerradas (resolvida/arquivada), para /admin/denuncias. */
export async function getReportHistoryPage(requestedPage: number) {
  const excludeStatuses = ["aberta", "em_analise"]
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(report)
    .where(notInArray(report.status, excludeStatuses))
  const { page, pages, offset, limit } = resolvePage(requestedPage, total, PAGE_SIZE)

  const rows = await getReportQueue({ excludeStatuses, limit, offset })
  return { reports: rows, total, page, pages }
}

export async function countReportsExcluding(excludeStatuses: string[]) {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(report)
    .where(notInArray(report.status, excludeStatuses))
  return row?.total ?? 0
}

export async function getReportDetail(id: number) {
  const [row] = await db
    .select(reportColumns)
    .from(report)
    .leftJoin(reporter, eq(reporter.id, report.reporterId))
    .leftJoin(product, eq(product.id, report.targetProductId))
    .leftJoin(targetUser, eq(targetUser.id, report.targetUserId))
    .where(eq(report.id, id))
    .limit(1)

  return row ?? null
}

/** Denúncias em aberto (aberta/em_analise) sobre um produto ou um usuário — evita duplicata do mesmo denunciante. */
export async function findOpenReport(
  reporterId: string,
  target: { productId: number } | { userId: string },
) {
  const [row] = await db
    .select({ id: report.id })
    .from(report)
    .where(
      and(
        eq(report.reporterId, reporterId),
        inArray(report.status, ["aberta", "em_analise"]),
        "productId" in target
          ? eq(report.targetProductId, target.productId)
          : eq(report.targetUserId, target.userId),
      ),
    )
    .limit(1)
  return Boolean(row)
}
