import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { sellerApplication } from "@/lib/db/schema"
import { getSession } from "@/lib/session"

/**
 * Porteiro único do painel do vendedor: garante que toda rota abaixo de
 * /painel/vendedor exige sessão e cadastro de loja aprovado, sem depender de
 * cada página repetir a checagem.
 */
export default async function PainelVendedorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session?.user) redirect("/entrar")

  const [application] = await db
    .select({ status: sellerApplication.status })
    .from(sellerApplication)
    .where(eq(sellerApplication.userId, session.user.id))
    .limit(1)

  if (application?.status !== "aprovado") redirect("/vender")

  return children
}
