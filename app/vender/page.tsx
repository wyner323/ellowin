import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { SellerWizard } from "@/components/seller/seller-wizard"
import { getAccountState } from "@/lib/session"

export const metadata: Metadata = {
  title: "Cadastro de vendedor",
  description:
    "Complete as etapas de verificação e comece a vender produtos digitais na Ellowin.",
}

export default async function VenderPage() {
  const state = await getAccountState()
  if (!state) redirect("/entrar?next=/vender")

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Cadastro de vendedor
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          A Ellowin libera recursos por nível. Cada etapa concluída aumenta seu limite de vendas e
          a confiança da sua loja na vitrine.
        </p>

        <div className="mt-8">
          <SellerWizard state={state} />
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
