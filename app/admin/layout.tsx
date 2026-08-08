import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { getStaff } from "@/lib/roles"

export const metadata: Metadata = {
  title: "Moderação Ellowin",
  robots: { index: false, follow: false },
}

/**
 * Guarda de acesso da área de moderação.
 *
 * Todo o histórico de disputas fica atrás deste layout, então basta um ponto de
 * verificação: sem cargo de moderador ou admin, nada abaixo carrega.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const staff = await getStaff()
  if (!staff) redirect("/")

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <div className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            Moderação Ellowin
          </span>

          <nav className="flex items-center gap-1" aria-label="Áreas da moderação">
            <Link
              href="/admin/disputas"
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Disputas
            </Link>
            {staff.role === "admin" ? (
              <Link
                href="/admin/usuarios"
                className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Cargos
              </Link>
            ) : null}
            <span className="ml-2 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
              {staff.role === "admin" ? "Administrador" : "Moderador"}
            </span>
          </nav>
        </div>
      </div>

      <main className="flex-1">{children}</main>

      <SiteFooter />
    </div>
  )
}
