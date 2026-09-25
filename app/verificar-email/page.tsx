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

  // Só caminho interno: "//evil.com" e "/\evil.com" começam com "/" mas o navegador os trata como outro site.
  const destination = next && /^\/(?![/\\])/.test(next) ? next : "/conta"
  if (session.user.emailVerified) redirect(destination)

  return (
    <AuthShell>
      <EmailVerification email={session.user.email} redirectTo={destination} />
    </AuthShell>
  )
}
