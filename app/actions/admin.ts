"use server"

import { eq, ilike, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { requireAdmin, type Role } from "@/lib/roles"
import type { ActionResult } from "@/app/actions/auth"

const ROLES: Role[] = ["user", "moderator", "admin"]

/**
 * Alteração de cargo. Só administradores executam.
 *
 * O cargo é o que libera o acesso ao histórico compartilhado das disputas, por
 * isso a promoção é restrita e o admin não pode rebaixar a si mesmo (evita
 * ficar sem nenhum administrador na plataforma).
 */
export async function setUserRole(input: {
  userId: string
  role: string
}): Promise<ActionResult> {
  const admin = await requireAdmin()

  if (!ROLES.includes(input.role as Role))
    return { ok: false, error: "Cargo inválido." }

  if (input.userId === admin.id && input.role !== "admin")
    return { ok: false, error: "Você não pode remover o seu próprio acesso de administrador." }

  await db
    .update(user)
    .set({ role: input.role })
    .where(eq(user.id, input.userId))

  revalidatePath("/admin/usuarios")
  return { ok: true, message: "Cargo atualizado." }
}

/** Busca de usuários por nome ou email, para o painel de cargos. */
export async function searchUsers(term: string) {
  await requireAdmin()

  const query = term.trim()

  const base = db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)

  const rows = query
    ? await base
        .where(or(ilike(user.name, `%${query}%`), ilike(user.email, `%${query}%`)))
        .limit(30)
    : await base.limit(30)

  return rows
}
