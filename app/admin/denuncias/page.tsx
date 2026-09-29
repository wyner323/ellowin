import Link from "next/link"
import { ChevronRight, Flag, Inbox } from "lucide-react"
import { Pagination } from "@/components/pagination"
import { countReportsExcluding, getReportHistoryPage, getReportQueue } from "@/lib/report-queries"
import { OPEN_REPORT_STATUSES, REPORT_STATUS_LABEL, reportReasonLabel } from "@/lib/reports"
import { parsePage } from "@/lib/pagination"

export const metadata = { title: "Fila de denúncias" }

export default async function FilaDenunciasPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>
}) {
  const sp = await searchParams

  const closedTotal = await countReportsExcluding(OPEN_REPORT_STATUSES)
  const requestedPage = parsePage(sp.pagina)
  const [open, closedPageData] = await Promise.all([
    getReportQueue({ statuses: OPEN_REPORT_STATUSES }),
    getReportHistoryPage(requestedPage),
  ])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Fila de denúncias</h1>
        <p className="text-sm text-muted-foreground">
          Anúncios e usuários denunciados por golpe, conta invadida, assédio ou anúncio
          enganoso. Qualquer moderador pode assumir um caso.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
          <span className="text-xs text-muted-foreground">Casos abertos</span>
          <strong className="font-display text-2xl font-bold">{open.length}</strong>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
          <span className="text-xs text-muted-foreground">Sem atendimento</span>
          <strong className="font-display text-2xl font-bold">
            {open.filter((r) => !r.moderatorId).length}
          </strong>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Em aberto</h2>

        {open.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-10 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Inbox className="size-5" aria-hidden="true" />
            </span>
            <p className="font-medium">Nenhuma denúncia em aberto</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/denuncias/${r.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Denúncia #{r.id} · {r.targetType === "anuncio" ? "Anúncio" : "Usuário"}
                      </span>
                      {!r.moderatorId ? (
                        <span className="rounded-full bg-chart-4/15 px-2 py-0.5 text-[0.7rem] font-medium text-chart-4">
                          Sem atendimento
                        </span>
                      ) : null}
                    </div>
                    <span className="truncate font-medium">
                      {r.targetType === "anuncio" ? r.targetProductTitle : r.targetUserName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {reportReasonLabel(r.reason)} · denunciado por {r.reporterName ?? "—"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Flag className="size-4 text-muted-foreground" aria-hidden="true" />
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {closedTotal > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Encerradas</h2>
          <ul className="flex flex-col gap-2">
            {closedPageData.reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/denuncias/${r.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 transition-colors hover:border-primary/40"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">
                      {r.targetType === "anuncio" ? r.targetProductTitle : r.targetUserName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Denúncia #{r.id} · {REPORT_STATUS_LABEL[r.status as keyof typeof REPORT_STATUS_LABEL] ?? r.status}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={closedPageData.page}
            pages={closedPageData.pages}
            total={closedTotal}
            basePath="/admin/denuncias"
          />
        </section>
      ) : null}
    </div>
  )
}
