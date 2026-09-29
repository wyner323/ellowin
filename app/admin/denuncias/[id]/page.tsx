import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { ResolveReport } from "@/components/admin/resolve-report"
import { Button } from "@/components/ui/button"
import { getReportDetail } from "@/lib/report-queries"
import { REPORT_STATUS_LABEL, reportReasonLabel, type ReportStatus } from "@/lib/reports"
import { requireStaff } from "@/lib/roles"

export const metadata = { title: "Denúncia" }

export default async function CasoDenunciaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const reportId = Number(id)
  if (!Number.isInteger(reportId)) notFound()

  const staff = await requireStaff()
  const report = await getReportDetail(reportId)
  if (!report) notFound()

  const status = report.status as ReportStatus
  const closed = status === "resolvida" || status === "arquivada"
  const targetHref =
    report.targetType === "anuncio" && report.targetProductSlug
      ? `/produtos/${report.targetProductSlug}`
      : null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div>
        <Button render={<Link href="/admin/denuncias" />} variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="size-4" />
          Fila de denúncias
        </Button>
      </div>

      <header className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Denúncia #{report.id} · {report.targetType === "anuncio" ? "Anúncio" : "Usuário"}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
            {REPORT_STATUS_LABEL[status] ?? status}
          </span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-pretty">
              {reportReasonLabel(report.reason)}
            </h1>
            <p className="text-sm text-muted-foreground">
              {report.moderatorId
                ? report.moderatorId === staff.id
                  ? "Atribuída a você"
                  : "Já atribuída a outro moderador — você pode dar continuidade"
                : "Sem moderador atribuído"}
            </p>
          </div>

          {targetHref ? (
            <Button render={<Link href={targetHref} />} variant="outline" size="sm">
              <ExternalLink className="size-4" />
              Ver anúncio
            </Button>
          ) : null}
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Dados do caso</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Denunciado por</dt>
            <dd className="text-sm break-words">{report.reporterName ?? "—"}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">
              {report.targetType === "anuncio" ? "Anúncio denunciado" : "Usuário denunciado"}
            </dt>
            <dd className="text-sm break-words">
              {report.targetType === "anuncio" ? report.targetProductTitle : report.targetUserName}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Aberta em</dt>
            <dd className="text-sm">{report.createdAt.toLocaleString("pt-BR")}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Relato do denunciante</h2>
        <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
          {report.description}
        </p>
      </section>

      {closed ? (
        <section className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/10 p-5">
          <h2 className="text-sm font-semibold text-primary">Caso encerrado</h2>
          <p className="text-sm text-primary">{report.resolutionNote}</p>
        </section>
      ) : (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Decisão</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            &ldquo;Confirmar irregularidade&rdquo; registra o caso contra o alvo, para pesar em
            decisões futuras. Nenhuma das duas opções mexe em pedidos ou saldos — para reembolso
            ou liberação, use a disputa do pedido.
          </p>
          <ResolveReport reportId={report.id} claimed={Boolean(report.moderatorId)} />
        </section>
      )}
    </div>
  )
}
