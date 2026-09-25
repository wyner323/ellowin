import type { Metadata } from "next"
import Link from "next/link"
import { AuthShell } from "@/components/auth/auth-shell"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Criar nova senha",
  // O token está na URL: nada de indexar, e o Referer não vaza (política estrita no next.config).
  robots: { index: false, follow: false },
}

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  return (
    <AuthShell>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Link inválido</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Este link de redefinição está incompleto ou já foi usado. Peça um novo para continuar.
            </p>
          </div>
          <Button render={<Link href="/esqueci-senha" />}>Pedir novo link</Button>
        </div>
      )}
    </AuthShell>
  )
}
