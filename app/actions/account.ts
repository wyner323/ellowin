"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { isValidAccentColor } from "@/lib/accent-colors"
import { isValidBio, isValidDisplayName } from "@/lib/validation"
import type { ActionResult } from "@/app/actions/auth"

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505")
}

/** Atualiza o apelido público exibido no chat, avaliações e anúncios. */
export async function updateDisplayName(input: { displayName: string }): Promise<ActionResult> {
  const userId = await getUserId()
  const trimmed = input.displayName.trim()

  if (!isValidDisplayName(trimmed))
    return {
      ok: false,
      field: "displayName",
      error: "Use de 2 a 20 caracteres — letras, números, espaço, _ ou -.",
    }

  try {
    await db
      .update(user)
      .set({ displayName: trimmed, updatedAt: new Date() })
      .where(eq(user.id, userId))
  } catch (error) {
    if (isUniqueViolation(error))
      return {
        ok: false,
        field: "displayName",
        error: "Esse apelido já está em uso. Escolha outro.",
      }
    throw error
  }

  revalidatePath("/", "layout")
  return { ok: true, message: "Apelido atualizado." }
}

/** Troca a foto de perfil. A URL já chega pronta do upload no Blob. */
export async function updateAvatar(input: { imageUrl: string }): Promise<ActionResult> {
  const userId = await getUserId()

  await db
    .update(user)
    .set({ image: input.imageUrl, updatedAt: new Date() })
    .where(eq(user.id, userId))

  revalidatePath("/", "layout")
  return { ok: true, message: "Foto de perfil atualizada." }
}

/** Remove a foto de perfil, voltando para as iniciais. */
export async function removeAvatar(): Promise<ActionResult> {
  const userId = await getUserId()

  await db
    .update(user)
    .set({ image: null, updatedAt: new Date() })
    .where(eq(user.id, userId))

  revalidatePath("/", "layout")
  return { ok: true }
}

/** Atualiza a bio curta exibida no perfil e na loja pública. */
export async function updateBio(input: { bio: string }): Promise<ActionResult> {
  const userId = await getUserId()
  const trimmed = input.bio.trim()

  if (!isValidBio(trimmed))
    return { ok: false, field: "bio", error: "A bio pode ter até 160 caracteres." }

  await db
    .update(user)
    .set({ bio: trimmed || null, updatedAt: new Date() })
    .where(eq(user.id, userId))

  revalidatePath("/", "layout")
  return { ok: true, message: "Bio atualizada." }
}

/** Atualiza a cor de destaque do avatar e da loja pública. */
export async function updateAccentColor(input: { accentColor: string }): Promise<ActionResult> {
  const userId = await getUserId()

  if (!isValidAccentColor(input.accentColor))
    return { ok: false, error: "Cor inválida." }

  await db
    .update(user)
    .set({
      accentColor: input.accentColor === "padrao" ? null : input.accentColor,
      updatedAt: new Date(),
    })
    .where(eq(user.id, userId))

  revalidatePath("/", "layout")
  return { ok: true }
}

/** Troca o banner da loja pública. Só faz sentido para vendedores aprovados. */
export async function updateBanner(input: { imageUrl: string }): Promise<ActionResult> {
  const userId = await getUserId()

  await db
    .update(user)
    .set({ bannerUrl: input.imageUrl, updatedAt: new Date() })
    .where(eq(user.id, userId))

  revalidatePath("/", "layout")
  return { ok: true, message: "Banner da loja atualizado." }
}

/** Remove o banner da loja, voltando pro fundo padrão. */
export async function removeBanner(): Promise<ActionResult> {
  const userId = await getUserId()

  await db
    .update(user)
    .set({ bannerUrl: null, updatedAt: new Date() })
    .where(eq(user.id, userId))

  revalidatePath("/", "layout")
  return { ok: true }
}
