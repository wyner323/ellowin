import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AuthShell } from "@/components/auth/auth-shell"
import { CompleteProfileForm } from "@/components/auth/complete-profile-form"
import { safeNext } from "@/lib/safe-redirect"
import { getSession, isProfileComplete } from "@/lib/session"

export const metadata: Metadata = {
  title: "Complete seu cadastro",
  robots: { index: false, follow: false },
}

export default async function CompletarCadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const destination = safeNext(next)

  const session = await getSession()
  if (!session?.user) redirect("/entrar")
  if (await isProfileComplete(session.user.id)) redirect(destination)

  return (
    <AuthShell>
      <CompleteProfileForm
        defaultName={session.user.name ?? ""}
        email={session.user.email}
        next={destination}
      />
    </AuthShell>
  )
}
