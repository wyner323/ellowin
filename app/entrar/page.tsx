import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AuthShell } from "@/components/auth/auth-shell"
import { LoginForm } from "@/components/auth/login-form"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse sua conta Ellowin para comprar e vender produtos digitais.",
}

export default async function EntrarPage() {
  const session = await getSession()
  if (session?.user) redirect("/conta")

  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  )
}
