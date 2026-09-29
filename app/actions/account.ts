"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { anonymizeAccount, getDeletionBlockers } from "@/lib/account-deletion"
import { isValidAccentColor } from "@/lib/accent-colors"
import { isOwnBlobUrl } from "@/lib/blob-urls"
import { sendAccountDeletedEmail } from "@/lib/email"
import { hitRateLimit } from "@/lib/rate-limit"
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

  if (!isOwnBlobUrl(input.imageUrl, "avatars", userId))
    return { ok: false, error: "Imagem inválida. Envie a foto de novo." }

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

  if (!isOwnBlobUrl(input.imageUrl, "banners", userId))
    return { ok: false, error: "Imagem inválida. Envie o banner de novo." }

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

const DELETION_PHRASE = "excluir minha conta"

/**
 * Exclusão (anonimização) da própria conta — ver lib/account-deletion.ts. Exige
 * digitar a frase de confirmação exata: é uma ação irreversível e sem volta,
 * então não basta um clique.
 */
export async function requestAccountDeletion(input: { confirm: string }): Promise<ActionResult> {
  const userId = await getUserId()

  if (input.confirm.trim().toLowerCase() !== DELETION_PHRASE)
    return { ok: false, field: "confirm", error: `Digite exatamente "${DELETION_PHRASE}" para confirmar.` }

  if (!(await hitRateLimit(`delete-account:${userId}`, 3, 60 * 60)))
    return { ok: false, error: "Muitas tentativas. Aguarde um pouco e tente de novo." }

  const blockers = await getDeletionBlockers(userId)
  if (blockers.length > 0) return { ok: false, error: blockers[0].message }

  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1)
  const email = row?.email

  await anonymizeAccount(userId)
  if (email) await sendAccountDeletedEmail(email).catch(() => {})

  revalidatePath("/", "layout")
  return { ok: true, message: "Conta excluída. Você será desconectado." }
}
