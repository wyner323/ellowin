import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { getSession } from "@/lib/session"

export type Role = "user" | "moderator" | "admin"

export type Staff = {
  id: string
  name: string
  email: string
  role: Role
}

function normalizeRole(value: string | null | undefined): Role {
  return value === "admin" || value === "moderator" ? value : "user"
}

/**
 * Cargo do usuário logado.
 *
 * Se o email logado for igual a `ELLOWIN_ADMIN_EMAIL` e o cargo ainda estiver
 * como `user`, ele é promovido a admin na primeira visita. É assim que o
 * primeiro administrador nasce sem precisar de acesso ao banco.
 */
export async function getCurrentStaff(): Promise<Staff | null> {
  const session = await getSession()
  if (!session?.user) return null

  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)

  if (!row) return null

  let role = normalizeRole(row.role)

  const bootstrapEmail = process.env.ELLOWIN_ADMIN_EMAIL?.trim().toLowerCase()
  if (bootstrapEmail && role === "user" && row.email.toLowerCase() === bootstrapEmail) {
    await db.update(user).set({ role: "admin" }).where(eq(user.id, row.id))
    role = "admin"
  }

  return { id: row.id, name: row.name, email: row.email, role }
}

export function isStaffRole(role: Role) {
  return role === "moderator" || role === "admin"
}

/** Staff = moderador ou admin. Ambos leem o histórico completo das disputas. */
export async function getStaff(): Promise<Staff | null> {
  const staff = await getCurrentStaff()
  if (!staff || !isStaffRole(staff.role)) return null
  return staff
}

export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff()
  if (!staff) throw new Error("Acesso restrito à moderação")
  return staff
}

export async function requireAdmin(): Promise<Staff> {
  const staff = await getCurrentStaff()
  if (staff?.role !== "admin") throw new Error("Acesso restrito a administradores")
  return staff
}
