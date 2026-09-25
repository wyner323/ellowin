import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AuthShell } from "@/components/auth/auth-shell"
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Esqueci minha senha",
  description: "Receba por email um link para criar uma nova senha da sua conta Ellowin.",
  robots: { index: false, follow: false },
}

export default async function EsqueciSenhaPage() {
  const session = await getSession()
  if (session?.user) redirect("/conta")

  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  )
}
