import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AuthShell } from "@/components/auth/auth-shell"
import { RegisterWizard } from "@/components/auth/register-wizard"
import { getSession } from "@/lib/session"

export const metadata: Metadata = {
  title: "Criar conta",
  description:
    "Crie sua conta Ellowin com CPF validado e email confirmado para comprar e vender produtos digitais com segurança.",
}

export default async function CadastroPage() {
  const session = await getSession()
  if (session?.user) redirect("/conta")

  return (
    <AuthShell>
      <RegisterWizard />
    </AuthShell>
  )
}
