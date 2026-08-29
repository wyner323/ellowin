import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { CalendarDays, ExternalLink, FileCheck2, Store, Wallet } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { AccentColorPicker } from "@/components/account/accent-color-picker"
import { AvatarUpload } from "@/components/account/avatar-upload"
import { BioForm } from "@/components/account/bio-form"
import { DisplayNameForm } from "@/components/account/display-name-form"
import { VerificationPanel } from "@/components/account/verification-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { AccentColorId } from "@/lib/accent-colors"
import { getAccountState, verificationProgress } from "@/lib/session"
import { formatCpf } from "@/lib/validation"
import { initialsOf, publicName } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Minha conta",
  description: "Acompanhe suas verificações, dados pessoais e status de vendedor na Ellowin.",
}

export default async function ContaPage() {
  const state = await getAccountState()
  if (!state) redirect("/entrar")

  const progress = verificationProgress(state)

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              Olá, {publicName(state.fullName.split(" ")[0], state.displayName)}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{state.email}</p>
          </div>
          <Badge variant={progress === 100 ? "default" : "secondary"}>
            {progress === 100 ? "Conta completa" : `${progress}% verificada`}
          </Badge>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Perfil público</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <AvatarUpload imageUrl={state.image} initials={initialsOf(state.fullName)} />
            <DisplayNameForm initialValue={state.displayName ?? ""} />
            <BioForm initialValue={state.bio ?? ""} />
            <AccentColorPicker
              initialValue={(state.accentColor as AccentColorId) ?? "padrao"}
            />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              Membro desde{" "}
              {state.memberSince.toLocaleDateString("pt-BR", {
                month: "long",
                year: "numeric",
              })}
            </p>
            {state.seller?.status === "aprovado" && state.seller.storeSlug ? (
              <Button
                render={<Link href={`/loja/${state.seller.storeSlug}`} />}
                variant="outline"
                size="sm"
                className="self-start"
              >
                <ExternalLink className="size-3.5" />
                Ver minha loja pública
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Progresso da verificação</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <Progress value={progress} className="h-2" />
            <div id="verificacoes" className="scroll-mt-24">
              <VerificationPanel
                email={state.email}
                emailVerified={state.emailVerified}
                phone={state.phone}
                phoneVerified={state.phoneVerified}
              />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados pessoais</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <Info label="Nome completo" value={state.fullName} />
              <Info
                label="CPF"
                value={state.cpf ? formatCpf(state.cpf) : "—"}
                note={state.cpfVerified ? "Validado no cadastro" : undefined}
              />
              <Info label="Email" value={state.email} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conta de vendedor</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {state.seller?.status === "aprovado" ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Store className="size-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{state.seller.storeName}</p>
                      <p className="text-xs text-muted-foreground">
                        Nível {state.seller.level} — apto a vender
                      </p>
                    </div>
                  </div>
                  <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <FileCheck2 className="size-3.5 text-primary" aria-hidden="true" />
                      Documento enviado para análise
                    </li>
                    <li className="flex items-center gap-2">
                      <Wallet className="size-3.5 text-primary" aria-hidden="true" />
                      Chave PIX cadastrada
                    </li>
                  </ul>
                  <Button
                    render={<Link href="/vender" />}
                    variant="outline"
                    size="sm"
                  >
                    Ver cadastro de vendedor
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {state.seller
                      ? `Cadastro em andamento — você parou na etapa ${state.seller.currentStep} de 5.`
                      : "Você ainda não é vendedor. Complete o cadastro em etapas para anunciar na Ellowin."}
                  </p>
                  <Button render={<Link href="/vender" />} size="sm">
                    {state.seller ? "Continuar cadastro" : "Quero vender"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}

function Info({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
      {note && <p className="text-xs text-primary">{note}</p>}
    </div>
  )
}
