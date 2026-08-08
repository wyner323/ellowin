import { redirect } from "next/navigation"
import { desc } from "drizzle-orm"
import { RoleManager } from "@/components/admin/role-manager"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { getCurrentStaff } from "@/lib/roles"

export default async function CargosPage() {
  const staff = await getCurrentStaff()
  if (staff?.role !== "admin") redirect("/admin/disputas")

  const users = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(30)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cargos</h1>
        <p className="text-sm text-muted-foreground">
          Moderadores e administradores têm acesso ao histórico completo de todas as
          disputas, incluindo as notas internas.
        </p>
      </header>

      <RoleManager initialUsers={users} currentAdminId={staff.id} />
    </div>
  )
}
