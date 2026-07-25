import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AuthShell } from "@/components/auth/auth-shell"
import { EmailVerification } from "@/components/auth/email-verification"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Confirmar email",
  description: "Confirme seu email com o código de 6 dígitos enviado pela Ellowin.",
}

export default async function VerificarEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const destination = next?.startsWith("/") ? next : "/conta"
  if (session.user.emailVerified) redirect(destination)

  return (
    <AuthShell>
      <EmailVerification email={session.user.email} redirectTo={destination} />
    </AuthShell>
  )
}
